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
export C15T_APP_E2E=1 C15T_FAKE_NATIVE=0
BACKEND_PORT="${C15T_APP_E2E_PORT:-39873}"
export C15T_E2E_URL="http://localhost:${BACKEND_PORT}"
BACKEND_PID=""; VIDEO_PID=""; LOG_PID=""; DEVICE=""; EMULATOR_PID=""; AVD_NAME=""

cleanup() {
  result=$?
  trap - EXIT
  set +e
  if [[ -n "${VIDEO_PID}" ]]; then
    if [[ "${PLATFORM}" == android ]]; then
      "${ADB}" -s "${DEVICE}" shell pkill -2 screenrecord
    else
      kill -INT "${VIDEO_PID}"
    fi
    wait "${VIDEO_PID}"
  fi
  if [[ -n "${LOG_PID}" ]]; then
    kill "${LOG_PID}"
    wait "${LOG_PID}"
  fi
  if [[ "${PLATFORM}" == ios && -n "${DEVICE}" ]]; then
    xcrun simctl io "${DEVICE}" screenshot "${OUT}/final.png"
    xcrun simctl spawn "${DEVICE}" log show --last 15m --style compact --predicate 'process == "C15tBare"' > "${OUT}/device.log" 2>&1
    if [[ -d "${OUT}/journey.xcresult" ]]; then
      xcrun xcresulttool export attachments --path "${OUT}/journey.xcresult" --output-path "${OUT}/attachments"
      xcrun xcresulttool get test-results summary --path "${OUT}/journey.xcresult" --format json > "${OUT}/test-summary.json"
    fi
    xcrun simctl shutdown "${DEVICE}"
    xcrun simctl delete "${DEVICE}"
  elif [[ "${PLATFORM}" == android ]]; then
    if [[ -n "${DEVICE}" && "$("${ADB}" -s "${DEVICE}" get-state 2>/dev/null)" == device ]]; then
      "${ADB}" -s "${DEVICE}" exec-out screencap -p > "${OUT}/final.png"
      "${ADB}" -s "${DEVICE}" pull /data/local/tmp/c15t-app-e2e.mp4 "${OUT}/journey.mp4"
      "${ADB}" -s "${DEVICE}" pull /sdcard/Android/data/com.c15t.bare.e2e/files/evidence "${OUT}/device-evidence"
      "${ADB}" -s "${DEVICE}" emu kill
    elif [[ -n "${EMULATOR_PID}" ]]; then
      kill "${EMULATOR_PID}"
    fi
    if [[ -e "${OUT}/test.log" ]]; then
      cp -R "${APP_DIR}/android/e2e/build/outputs/androidTest-results" "${OUT}/junit"
    fi
    [[ -z "${EMULATOR_PID}" ]] || wait "${EMULATOR_PID}"
    [[ -z "${AVD_NAME}" ]] || "${AVDMANAGER}" delete avd --name "${AVD_NAME}"
  fi
  [[ -z "${BACKEND_PID}" ]] || { kill "${BACKEND_PID}"; wait "${BACKEND_PID}"; }
  python3 "${APP_DIR}/scripts/e2e-result.py" "${OUT}" "${PLATFORM}" "${result}" || result=1
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
bun --version > "${OUT}/bun-version.txt"
bun turbo run build --filter=@c15t/react-native > "${OUT}/dependencies.log" 2>&1

if [[ "${PLATFORM}" == ios ]]; then
  bun run --cwd "${APP_DIR}" pod-install > "${OUT}/pods.log" 2>&1
  RUNTIME="${C15T_IOS_RUNTIME:-$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; print(next(r["identifier"] for r in json.load(sys.stdin)["runtimes"] if r["isAvailable"] and r["name"].startswith("iOS")))')}"
  DEVICE="$(xcrun simctl create "c15t-app-e2e-${RUN_ID}" "${C15T_IOS_DEVICE:-iPhone 17 Pro}" "${RUNTIME}")"
  printf '%s\n' "${DEVICE}" > "${OUT}/device-id.txt"
  xcodebuild -version > "${OUT}/toolchain.txt"
  printf '%s\n' "${RUNTIME}" > "${OUT}/device-version.txt"
  xcrun simctl boot "${DEVICE}"
  xcrun simctl bootstatus "${DEVICE}" -b > "${OUT}/boot.log" 2>&1
  xcrun simctl ui "${DEVICE}" appearance light
  # Build separately so the recording contains the journey, not compilation.
  EXTRA_PACKAGER_ARGS=--reset-cache xcodebuild build-for-testing \
    -workspace "${APP_DIR}/ios/C15tBare.xcworkspace" -scheme C15tBare \
    -configuration Release -destination "platform=iOS Simulator,id=${DEVICE}" \
    -derivedDataPath "${C15T_APP_E2E_DERIVED:-${OUT}/derived}" \
    CODE_SIGNING_ALLOWED=YES CODE_SIGNING_FOR_SIMULATOR=YES CODE_SIGN_IDENTITY=- \
    ONLY_ACTIVE_ARCH=YES > "${OUT}/build.log" 2>&1
  # Override the built test artifact, never the reference app's checked-in config.
  APP_PLIST="${C15T_APP_E2E_DERIVED:-${OUT}/derived}/Build/Products/Release-iphonesimulator/C15tBare.app/Info.plist"
  /usr/libexec/PlistBuddy -c 'Set :com.c15t.backend.mode selfHosted' "${APP_PLIST}"
  /usr/libexec/PlistBuddy -c "Set :com.c15t.backend.url ${C15T_E2E_URL}/api/self-host" "${APP_PLIST}"
  /usr/libexec/PlistBuddy -c "Add :C15tAppE2EURL string ${C15T_E2E_URL}" "${APP_PLIST}"
  /usr/libexec/PlistBuddy -c "Set :com.c15t.reactnative.AutoBootstrap false" "${APP_PLIST}" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :com.c15t.reactnative.AutoBootstrap bool false" "${APP_PLIST}"
  # Keep the simulator Keychain entitlement after changing the test-only endpoint.
  codesign --force --sign - --preserve-metadata=identifier,entitlements "${APP_PLIST%/Info.plist}" > "${OUT}/signing.log" 2>&1
  python3 - "${C15T_APP_E2E_DERIVED:-${OUT}/derived}/Build/Products" "${C15T_E2E_URL}" <<'PYRUN'
import pathlib,plistlib,sys
for path in pathlib.Path(sys.argv[1]).glob('*.xctestrun'):
 data=plistlib.loads(path.read_bytes())
 def update(value):
  if isinstance(value,dict):
   if 'TestBundlePath' in value: value.setdefault('EnvironmentVariables',{})['C15T_E2E_URL']=sys.argv[2]
   for child in list(value.values()): update(child)
  elif isinstance(value,list):
   for child in value: update(child)
 update(data)
 path.write_bytes(plistlib.dumps(data))
PYRUN
  xcrun simctl io "${DEVICE}" recordVideo --codec=h264 "${OUT}/journey.mp4" > "${OUT}/video.log" 2>&1 &
  VIDEO_PID=$!
  xcodebuild test-without-building \
    -workspace "${APP_DIR}/ios/C15tBare.xcworkspace" -scheme C15tBare \
    -configuration Release -destination "platform=iOS Simulator,id=${DEVICE}" \
    -derivedDataPath "${C15T_APP_E2E_DERIVED:-${OUT}/derived}" \
    -resultBundlePath "${OUT}/journey.xcresult" -parallel-testing-enabled NO \
    -maximum-concurrent-test-simulator-destinations 1 \
    -collect-test-diagnostics never \
    -test-timeouts-enabled YES -default-test-execution-time-allowance 240 \
    CODE_SIGNING_ALLOWED=YES CODE_SIGNING_FOR_SIMULATOR=YES CODE_SIGN_IDENTITY=- > "${OUT}/test.log" 2>&1
elif [[ "${PLATFORM}" == android ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Library/Android/sdk}"
  ADB="${ANDROID_HOME}/platform-tools/adb"
  AVDMANAGER="${ANDROID_HOME}/cmdline-tools/latest/bin/avdmanager"
  IMAGE="${C15T_ANDROID_IMAGE:-system-images;android-36;google_apis;arm64-v8a}"
  AVD_NAME="c15t-app-e2e-${RUN_ID}"
  echo no | "${AVDMANAGER}" create avd --name "${AVD_NAME}" --package "${IMAGE}" --device pixel_6 > "${OUT}/avd.log" 2>&1
  PORT="$(python3 -c 'import socket
for p in range(5600, 5680, 2):
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
  "${ADB}" -s "${DEVICE}" shell input keyevent 82
  "${ADB}" -s "${DEVICE}" reverse tcp:3000 "tcp:${BACKEND_PORT}"
  # JS/instrumentation keep a stable device endpoint; only this owned emulator is reversed.
  export C15T_E2E_URL=http://localhost:3000
  export C15T_MAVEN_URL="file://${REPO_ROOT}/native/core-android/build/maven-staging"
  sh "${REPO_ROOT}/native/core-android/gradlew" -p "${REPO_ROOT}/native/core-android" --max-workers=4 \
    :c15t-core:publishAllPublicationsToStagingRepository :c15t-android:publishAllPublicationsToStagingRepository :c15t-consent-ui:publishAllPublicationsToStagingRepository > "${OUT}/native-artifacts.log" 2>&1
  ARCH="${C15T_ANDROID_ARCH:-arm64-v8a}"
  rm -rf "${APP_DIR}/android/e2e/build/outputs/androidTest-results"
  sh "${APP_DIR}/android/gradlew" -p "${APP_DIR}/android" :app:assembleRelease :e2e:assembleRelease \
    -Pc15t.appE2e=true -PreactNativeArchitectures="${ARCH}" > "${OUT}/build.log" 2>&1
  "${ADB}" -s "${DEVICE}" logcat -v threadtime > "${OUT}/device.log" 2>&1 &
  LOG_PID=$!
  "${ADB}" -s "${DEVICE}" shell screenrecord --time-limit 180 /data/local/tmp/c15t-app-e2e.mp4 > "${OUT}/video.log" 2>&1 &
  VIDEO_PID=$!
  sleep 1
  kill -0 "${VIDEO_PID}" || { cat "${OUT}/video.log"; exit 1; }
  sh "${APP_DIR}/android/gradlew" -p "${APP_DIR}/android" :e2e:connectedReleaseAndroidTest \
    -Pc15t.appE2e=true -PreactNativeArchitectures="${ARCH}" \
    -Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true > "${OUT}/test.log" 2>&1
else
  echo "Unknown platform: ${PLATFORM}" >&2
  exit 2
fi
