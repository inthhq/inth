#!/usr/bin/env bash
# Release app + native UI runner. No Metro and no live project credentials.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${APP_DIR}/../../.." && pwd)"
PLATFORM="${1:?Usage: app-e2e.sh ios|android}"
RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
OUT="${C15T_APP_E2E_OUT:-${APP_DIR}/.artifacts/app-e2e/${PLATFORM}-${RUN_ID}}"
mkdir -p "${OUT}"
OUT="$(cd "${OUT}" && pwd)"
[[ ! -e "${OUT}/backend-ready" && ! -e "${OUT}/result.json" ]] || { echo "Use a fresh evidence directory: ${OUT}" >&2; exit 2; }
# tsx creates a Unix socket under TMPDIR. Evidence paths can exceed its path limit.
TASK_TMP="$(mktemp -d /tmp/inth-app-e2e.XXXXXX)"
export TMPDIR="${TASK_TMP}/"
printf '%s\n' "${TASK_TMP}" > "${OUT}/temporary-directory.txt"
export C15T_APP_E2E=1 C15T_FAKE_NATIVE=0
export C15T_APP_E2E_SCENARIO="${C15T_APP_E2E_SCENARIO:-category}"
printf '%s\n' "${C15T_APP_E2E_SCENARIO}" > "${OUT}/scenario.txt"
BACKEND_PORT="${C15T_APP_E2E_PORT:-39873}"
export C15T_E2E_URL="http://localhost:${BACKEND_PORT}"
BACKEND_PID=""; VIDEO_PID=""; LOG_PID=""; FIREBASE_LOG_PID=""; DEVICE=""; EMULATOR_PID=""; AVD_NAME=""

cleanup() {
  result=$?
  trap - EXIT
  set +e
  if [[ -n "${VIDEO_PID}" ]]; then
    if [[ "${PLATFORM}" == android ]]; then
      "${ADB}" -s "${DEVICE}" shell touch /data/local/tmp/inth-video-stop
      "${ADB}" -s "${DEVICE}" shell pkill -2 screenrecord
      "${ADB}" -s "${DEVICE}" shell 'for i in 1 2 3 4 5 6 7 8 9 10; do pidof screenrecord >/dev/null || exit 0; sleep 1; done; exit 1'
    else
      kill -INT "${VIDEO_PID}"
    fi
    [[ "${PLATFORM}" == android ]] || wait "${VIDEO_PID}"
  fi
  if [[ -n "${LOG_PID}" ]]; then
    kill "${LOG_PID}"
    wait "${LOG_PID}"
  fi
  if [[ -n "${FIREBASE_LOG_PID}" ]]; then
    kill "${FIREBASE_LOG_PID}"
    wait "${FIREBASE_LOG_PID}"
  fi
  if [[ "${PLATFORM}" == ios && -n "${DEVICE}" ]]; then
    xcrun simctl io "${DEVICE}" screenshot "${OUT}/final.png"
    xcrun simctl spawn "${DEVICE}" log show --last 15m --style compact --predicate 'process == "InthBare"' > "${OUT}/device.log" 2>&1
    if [[ -d "${OUT}/journey.xcresult" ]]; then
      xcrun xcresulttool export attachments --path "${OUT}/journey.xcresult" --output-path "${OUT}/attachments"
      xcrun xcresulttool get test-results summary --path "${OUT}/journey.xcresult" --format json > "${OUT}/test-summary.json"
    fi
    xcrun simctl shutdown "${DEVICE}"
    xcrun simctl delete "${DEVICE}"
  elif [[ "${PLATFORM}" == android ]]; then
    if [[ -n "${DEVICE}" && "$("${ADB}" -s "${DEVICE}" get-state 2>/dev/null)" == device ]]; then
      "${ADB}" -s "${DEVICE}" logcat -d -v threadtime > "${OUT}/device-final.log" 2>&1
      # The main buffer can drop an app crash's stack. The crash buffer keeps it.
      "${ADB}" -s "${DEVICE}" logcat -b crash -d -v threadtime > "${OUT}/device-crash.log" 2>&1
      # Logcat prints no stack when an UnknownHostException is in the cause chain. Dropbox keeps it.
      for tag in data_app_crash data_app_native_crash; do
        "${ADB}" -s "${DEVICE}" shell dumpsys dropbox --print "${tag}" > "${OUT}/dropbox-${tag}.txt" 2>&1
      done
      "${ADB}" -s "${DEVICE}" exec-out screencap -p > "${OUT}/final.png"
      "${ADB}" -s "${DEVICE}" pull /data/local/tmp/inth-video.log "${OUT}/video.log"
      mkdir -p "${OUT}/video-segments"
      "${ADB}" -s "${DEVICE}" pull /data/local/tmp/inth-video-segments/. "${OUT}/video-segments"
      python3 - "${OUT}" <<'PYVIDEO'
import pathlib,subprocess,sys
out=pathlib.Path(sys.argv[1])
segments=sorted((out/'video-segments').glob('*.mp4'))
if not segments: raise RuntimeError('No Android recording segments')
manifest=out/'video-segments/concat.txt'
manifest.write_text(''.join("file '"+path.name+"'\n" for path in segments))
subprocess.run(['ffmpeg','-v','error','-f','concat','-safe','0','-i',str(manifest),'-c','copy','-movflags','+faststart',str(out/'journey.mp4')],check=True)
PYVIDEO
      "${ADB}" -s "${DEVICE}" pull /sdcard/Android/data/com.inth.bare.e2e/files/evidence "${OUT}/device-evidence"
      "${ADB}" -s "${DEVICE}" emu kill
    elif [[ -n "${EMULATOR_PID}" ]]; then
      kill "${EMULATOR_PID}"
    fi
    [[ -z "${EMULATOR_PID}" ]] || wait "${EMULATOR_PID}"
    [[ -z "${AVD_NAME}" ]] || "${AVDMANAGER}" delete avd --name "${AVD_NAME}"
  fi
  [[ -z "${BACKEND_PID}" ]] || { kill "${BACKEND_PID}"; wait "${BACKEND_PID}"; }
  if [[ "${result}" == 0 && "${C15T_APP_E2E_SCENARIO}" == expiry ]]; then
    python3 "${APP_DIR}/scripts/verify-expiry.py" "${OUT}" > "${OUT}/expiry-verification.log" 2>&1 || result=1
  fi
  # The journey records each vendor step; Firebase is checked against its own log.
  if [[ -s "${OUT}/vendor-steps.jsonl" ]]; then
    python3 "${APP_DIR}/scripts/verify-vendor-firebase.py" "${OUT}" "${PLATFORM}" > "${OUT}/vendor-firebase-verification.log" 2>&1 || result=1
  fi
  python3 "${APP_DIR}/scripts/e2e-result.py" "${OUT}" "${PLATFORM}" "${result}" || result=1
  rm -rf "${TASK_TMP}"
  printf 'Mobile app E2E exit %s. Evidence: %s\n' "${result}" "${OUT}"
  exit "${result}"
}
trap cleanup EXIT

# Binding fails on an occupied test port. Never reuse an unknown backend.
python3 "${APP_DIR}/scripts/e2e-backend.py" --out "${OUT}" --port "${BACKEND_PORT}" --scenario "${C15T_APP_E2E_SCENARIO:-category}" > "${OUT}/backend.log" 2>&1 &
BACKEND_PID=$!
for attempt in {1..40}; do
  kill -0 "${BACKEND_PID}" || { cat "${OUT}/backend.log"; exit 1; }
  [[ ! -e "${OUT}/backend-ready" ]] || break
  sleep 0.25
done
kill -0 "${BACKEND_PID}"
[[ -e "${OUT}/backend-ready" ]]
curl -fsS http://127.0.0.1:${BACKEND_PORT}/health > "${OUT}/backend-health.json"
cd "${REPO_ROOT}"
git rev-parse HEAD > "${OUT}/source-head.txt"
git diff --stat > "${OUT}/source-diff.txt"
git diff --binary > "${OUT}/source.patch"
bun --version > "${OUT}/bun-version.txt"
bun turbo run build --filter=@inth/react-native --filter=@inth/sdk-schema > "${OUT}/dependencies.log" 2>&1

[[ "${PLATFORM}" != android ]] || export C15T_E2E_URL=http://localhost:3000
mkdir -p "${OUT}/policy-assets"
C15T_E2E_BINDING="${C15T_E2E_URL}" C15T_E2E_FETCH="http://localhost:${BACKEND_PORT}" bunx tsx scripts/export-mobile-e2e-policy.ts "${OUT}/policy-assets/inth-policy.json"
if [[ "${PLATFORM}" == ios ]]; then
  bun run --cwd "${APP_DIR}" pod-install > "${OUT}/pods.log" 2>&1
  RUNTIME="${C15T_IOS_RUNTIME:-$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; print(next(r["identifier"] for r in json.load(sys.stdin)["runtimes"] if r["isAvailable"] and r["name"].startswith("iOS")))')}"
  DEVICE="$(xcrun simctl create "inth-app-e2e-${RUN_ID}" "${C15T_IOS_DEVICE:-iPhone 17 Pro}" "${RUNTIME}")"
  printf '%s\n' "${DEVICE}" > "${OUT}/device-id.txt"
  xcodebuild -version > "${OUT}/toolchain.txt"
  printf '%s\n' "${RUNTIME}" > "${OUT}/device-version.txt"
  xcrun simctl boot "${DEVICE}"
  xcrun simctl bootstatus "${DEVICE}" -b > "${OUT}/boot.log" 2>&1
  xcrun simctl ui "${DEVICE}" appearance light
  # Build separately so the recording contains the journey, not compilation.
  EXTRA_PACKAGER_ARGS=--reset-cache xcodebuild build-for-testing \
    -workspace "${APP_DIR}/ios/InthBare.xcworkspace" -scheme InthBare \
    -configuration Release -destination "platform=iOS Simulator,id=${DEVICE}" \
    -derivedDataPath "${C15T_APP_E2E_DERIVED:-${OUT}/derived}" \
    CODE_SIGNING_ALLOWED=YES CODE_SIGNING_FOR_SIMULATOR=YES CODE_SIGN_IDENTITY=- \
    ONLY_ACTIVE_ARCH=YES > "${OUT}/build.log" 2>&1
  # Override the built test artifact, never the reference app's checked-in config.
  APP_PLIST="${C15T_APP_E2E_DERIVED:-${OUT}/derived}/Build/Products/Release-iphonesimulator/InthBare.app/Info.plist"
  /usr/libexec/PlistBuddy -c "Set :com.inth.backend.url ${C15T_E2E_URL}/api/self-host" "${APP_PLIST}"
  /usr/libexec/PlistBuddy -c "Add :InthAppE2EURL string ${C15T_E2E_URL}" "${APP_PLIST}"
  /usr/libexec/PlistBuddy -c "Set :com.inth.reactnative.AutoBootstrap false" "${APP_PLIST}" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :com.inth.reactnative.AutoBootstrap bool false" "${APP_PLIST}"
  cp "${OUT}/policy-assets/inth-policy.json" "${APP_PLIST%/Info.plist}/inth-policy.json"
  # Keep the simulator Keychain entitlement after changing the test-only endpoint.
  codesign --force --sign - --preserve-metadata=identifier,entitlements "${APP_PLIST%/Info.plist}" > "${OUT}/signing.log" 2>&1
  python3 - "${C15T_APP_E2E_DERIVED:-${OUT}/derived}/Build/Products" "${C15T_E2E_URL}" <<'PYRUN'
import pathlib,plistlib,sys
for path in pathlib.Path(sys.argv[1]).glob('*.xctestrun'):
 data=plistlib.loads(path.read_bytes())
 def update(value):
  if isinstance(value,dict):
   if 'TestBundlePath' in value:
    value.setdefault('EnvironmentVariables',{})['C15T_E2E_URL']=sys.argv[2]
    value['EnvironmentVariables']['C15T_APP_E2E_SCENARIO']=__import__('os').environ['C15T_APP_E2E_SCENARIO']
   for child in list(value.values()): update(child)
  elif isinstance(value,list):
   for child in value: update(child)
 update(data)
 path.write_bytes(plistlib.dumps(data))
PYRUN
  # Firebase cannot be redirected; its debug log (the journey launches with
  # -FIRDebugEnabled -FIRAnalyticsDebugEnabled) is the evidence for its consent state.
  xcrun simctl spawn "${DEVICE}" log stream --level debug --style compact --predicate 'process == "InthBare"' > "${OUT}/app-stream.log" 2>&1 &
  LOG_PID=$!
  xcrun simctl io "${DEVICE}" recordVideo --codec=h264 "${OUT}/journey.mp4" > "${OUT}/video.log" 2>&1 &
  VIDEO_PID=$!
  XCTESTRUN="$(find "${C15T_APP_E2E_DERIVED:-${OUT}/derived}/Build/Products" -maxdepth 1 -name '*.xctestrun' -print -quit)"
  xcodebuild test-without-building \
    -xctestrun "${XCTESTRUN}" -destination "platform=iOS Simulator,id=${DEVICE}" \
    -derivedDataPath "${C15T_APP_E2E_DERIVED:-${OUT}/derived}" \
    -resultBundlePath "${OUT}/journey.xcresult" -parallel-testing-enabled NO \
    -maximum-concurrent-test-simulator-destinations 1 \
    -collect-test-diagnostics never \
    -test-timeouts-enabled YES -default-test-execution-time-allowance 360 \
    CODE_SIGNING_ALLOWED=YES CODE_SIGNING_FOR_SIMULATOR=YES CODE_SIGN_IDENTITY=- > "${OUT}/test.log" 2>&1
elif [[ "${PLATFORM}" == android ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Library/Android/sdk}"
  ADB="${ANDROID_HOME}/platform-tools/adb"
  AVDMANAGER="${ANDROID_HOME}/cmdline-tools/latest/bin/avdmanager"
  IMAGE="${C15T_ANDROID_IMAGE:-system-images;android-36;google_apis;arm64-v8a}"
  AVD_NAME="inth-app-e2e-${RUN_ID}"
  echo no | "${AVDMANAGER}" create avd --name "${AVD_NAME}" --package "${IMAGE}" --device pixel_6 > "${OUT}/avd.log" 2>&1
  PORT="$(python3 -c 'import socket
for p in list(range(5554, 5580, 2)) + [5582, 5584]:
 s=socket.socket()
 try: s.bind(("127.0.0.1",p)); print(p); break
 except OSError: pass
 finally: s.close()')"
  DEVICE="emulator-${PORT}"
  export ANDROID_SERIAL="${DEVICE}"
  printf '%s\n' "${DEVICE}" > "${OUT}/device-id.txt"
  "${ANDROID_HOME}/emulator/emulator" -avd "${AVD_NAME}" -port "${PORT}" -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect > "${OUT}/emulator.log" 2>&1 &
  EMULATOR_PID=$!
  "${ADB}" -s "${DEVICE}" wait-for-device
  for attempt in {1..180}; do
    [[ "$("${ADB}" -s "${DEVICE}" shell getprop sys.boot_completed | tr -d '\r')" != 1 ]] || break
    kill -0 "${EMULATOR_PID}"
    sleep 1
  done
  [[ "$("${ADB}" -s "${DEVICE}" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]
  "${ADB}" -s "${DEVICE}" shell getprop ro.build.version.sdk > "${OUT}/device-version.txt"
  "${ADB}" -s "${DEVICE}" shell getprop ro.build.version.release >> "${OUT}/device-version.txt"
  java -version > "${OUT}/toolchain.txt" 2>&1
  "${ADB}" -s "${DEVICE}" shell settings put system screen_off_timeout 2147483647
  "${ADB}" -s "${DEVICE}" shell svc power stayon true
  "${ADB}" -s "${DEVICE}" shell input keyevent 224
  "${ADB}" -s "${DEVICE}" shell input keyevent 82
  "${ADB}" -s "${DEVICE}" reverse tcp:3000 "tcp:${BACKEND_PORT}"
  # JS/instrumentation keep a stable device endpoint; only this owned emulator is reversed.
  export C15T_E2E_URL=http://localhost:3000
  # Mixpanel's Android SDK sends nothing to a host that resolves to loopback, so it
  # reaches the same backend through the emulator's alias for the host machine.
  export C15T_E2E_MIXPANEL_URL="http://10.0.2.2:${BACKEND_PORT}"
  export C15T_MAVEN_URL="file://${REPO_ROOT}/packages/android/build/maven-staging"
  sh "${REPO_ROOT}/packages/android/gradlew" -p "${REPO_ROOT}/packages/android" --max-workers=4 \
    :inth-core:publishAllPublicationsToStagingRepository :inth-android:publishAllPublicationsToStagingRepository :inth-consent-ui:publishAllPublicationsToStagingRepository > "${OUT}/native-artifacts.log" 2>&1
  ARCH="${C15T_ANDROID_ARCH:-arm64-v8a}"
  rm -rf "${APP_DIR}/android/e2e/build/outputs/androidTest-results"
  sh "${APP_DIR}/android/gradlew" -p "${APP_DIR}/android" --refresh-dependencies :app:assembleRelease :e2e:assembleRelease \
    -Pinth.appE2e=true -Pinth.policyAssets="${OUT}/policy-assets" -PreactNativeArchitectures="${ARCH}" > "${OUT}/build.log" 2>&1
  "${ADB}" -s "${DEVICE}" shell input keyevent 224
  # Firebase cannot be redirected; its verbose log is the evidence for its consent state.
  "${ADB}" -s "${DEVICE}" shell setprop log.tag.FA VERBOSE
  "${ADB}" -s "${DEVICE}" shell setprop log.tag.FA-SVC VERBOSE
  "${ADB}" -s "${DEVICE}" logcat -v threadtime > "${OUT}/device.log" 2>&1 &
  LOG_PID=$!
  # Epoch timestamps line Firebase's state up with the probe times the app reports.
  "${ADB}" -s "${DEVICE}" logcat -v epoch -s FA:V FA-SVC:V > "${OUT}/firebase.log" 2>&1 &
  FIREBASE_LOG_PID=$!
  cat > "${OUT}/record-video.sh" <<'SHVIDEO'
#!/system/bin/sh
mkdir -p /data/local/tmp/inth-video-segments
segment=0
while [ ! -e /data/local/tmp/inth-video-stop ]; do
  screenrecord --time-limit 170 "/data/local/tmp/inth-video-segments/$(printf '%03d' "$segment").mp4"
  segment=$((segment + 1))
done
SHVIDEO
  "${ADB}" -s "${DEVICE}" push "${OUT}/record-video.sh" /data/local/tmp/inth-record-video.sh > "${OUT}/video-start.log" 2>&1
  "${ADB}" -s "${DEVICE}" shell 'nohup sh /data/local/tmp/inth-record-video.sh >/data/local/tmp/inth-video.log 2>&1 </dev/null &'
  VIDEO_PID=remote
  "${ADB}" -s "${DEVICE}" reverse tcp:3000 "tcp:${BACKEND_PORT}"
  "${ADB}" -s "${DEVICE}" install -r "${APP_DIR}/android/app/build/outputs/apk/release/app-release.apk" > "${OUT}/install.log" 2>&1
  "${ADB}" -s "${DEVICE}" install -r "${APP_DIR}/android/e2e/build/outputs/apk/release/e2e-release.apk" >> "${OUT}/install.log" 2>&1
  instrument_exit=0
  "${ADB}" -s "${DEVICE}" shell am instrument -w -r \
    -e scenario "${C15T_APP_E2E_SCENARIO}" -e class com.inth.bare.e2e.ConsentJourney \
    com.inth.bare.e2e/androidx.test.runner.AndroidJUnitRunner > "${OUT}/test.log" 2>&1 || instrument_exit=$?
  python3 "${APP_DIR}/scripts/android-instrumentation-result.py" "${OUT}/test.log" "${OUT}/junit/TEST-consent-journey.xml"
  [[ "${instrument_exit}" == 0 ]] || exit "${instrument_exit}"

else
  echo "Unknown platform: ${PLATFORM}" >&2
  exit 2
fi
