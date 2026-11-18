#!/usr/bin/env bash
# Expo Release app with the real vendor SDKs, driven through the consent journey.
# No Metro and no Expo Go: the JavaScript bundle is inside the binary.
#
#   scripts/vendor-e2e.sh ios|android
#
# C15T_EXPO_CELL=expo-55|expo-56|expo-57 builds a packed consumer at that cell's pinned
# Expo, React Native and React (scripts/mobile-compatibility.json), outside the
# checkout. Unset, it builds this fixture in place at its committed versions.
# The backend, capture server and Firebase log check are the bare fixture's.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${APP_DIR}/../../.." && pwd)"
BARE_DIR="${REPO_ROOT}/internals/fixtures/react-native-bare"
PLATFORM="${1:?Usage: vendor-e2e.sh ios|android}"
[[ "${PLATFORM}" == ios || "${PLATFORM}" == android ]] || { echo "Unknown platform: ${PLATFORM}" >&2; exit 2; }
CELL="${C15T_EXPO_CELL:-}"
LABEL="${CELL:-fixture}"
RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
OUT="${C15T_APP_E2E_OUT:-${APP_DIR}/.artifacts/vendor-e2e/${LABEL}-${PLATFORM}-${RUN_ID}}"
mkdir -p "${OUT}"
OUT="$(cd "${OUT}" && pwd)"
[[ ! -e "${OUT}/backend-ready" && ! -e "${OUT}/result.json" ]] || { echo "Use a fresh evidence directory: ${OUT}" >&2; exit 2; }
# tsx creates a Unix socket under TMPDIR. Evidence paths can exceed its path limit.
TASK_TMP="$(mktemp -d /tmp/inth-expo-e2e.XXXXXX)"
export TMPDIR="${TASK_TMP}/"
printf '%s\n' "${LABEL}" > "${OUT}/cell.txt"
BACKEND_PORT="${C15T_APP_E2E_PORT:-39875}"
BACKEND_PID=""; VIDEO_PID=""; LOG_PID=""; FIREBASE_LOG_PID=""; DEVICE=""; EMULATOR_PID=""; AVD_NAME=""; CONSUMER=""

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
      wait "${VIDEO_PID}"
    fi
  fi
  for pid in "${LOG_PID}" "${FIREBASE_LOG_PID}"; do
    [[ -z "${pid}" ]] || { kill "${pid}"; wait "${pid}"; }
  done
  if [[ "${PLATFORM}" == ios && -n "${DEVICE}" ]]; then
    xcrun simctl io "${DEVICE}" screenshot "${OUT}/final.png"
    xcrun simctl spawn "${DEVICE}" log show --last 20m --style compact --predicate 'process == "inthExpoDev"' > "${OUT}/device.log" 2>&1
    if [[ -d "${OUT}/journey.xcresult" ]]; then
      xcrun xcresulttool export attachments --path "${OUT}/journey.xcresult" --output-path "${OUT}/attachments"
      xcrun xcresulttool get test-results summary --path "${OUT}/journey.xcresult" --format json > "${OUT}/test-summary.json"
    fi
    xcrun simctl shutdown "${DEVICE}"
    xcrun simctl delete "${DEVICE}"
  elif [[ "${PLATFORM}" == android ]]; then
    if [[ -n "${DEVICE}" && "$("${ADB}" -s "${DEVICE}" get-state 2>/dev/null)" == device ]]; then
      "${ADB}" -s "${DEVICE}" logcat -d -v threadtime > "${OUT}/device-final.log" 2>&1
      "${ADB}" -s "${DEVICE}" exec-out screencap -p > "${OUT}/final.png"
      mkdir -p "${OUT}/video-segments"
      "${ADB}" -s "${DEVICE}" pull /data/local/tmp/inth-video-segments/. "${OUT}/video-segments"
      python3 - "${OUT}" <<'PYVIDEO'
import pathlib,subprocess,sys
out=pathlib.Path(sys.argv[1])
segments=sorted((out/'video-segments').glob('*.mp4'))
if segments:
  manifest=out/'video-segments/concat.txt'
  manifest.write_text(''.join("file '"+path.name+"'\n" for path in segments))
  subprocess.run(['ffmpeg','-v','error','-f','concat','-safe','0','-i',str(manifest),'-c','copy','-movflags','+faststart',str(out/'journey.mp4')],check=True)
PYVIDEO
      "${ADB}" -s "${DEVICE}" emu kill
    elif [[ -n "${EMULATOR_PID}" ]]; then
      kill "${EMULATOR_PID}"
    fi
    [[ -z "${EMULATOR_PID}" ]] || wait "${EMULATOR_PID}"
    [[ -z "${AVD_NAME}" ]] || "${AVDMANAGER}" delete avd --name "${AVD_NAME}"
  fi
  [[ -z "${BACKEND_PID}" ]] || { kill "${BACKEND_PID}"; wait "${BACKEND_PID}"; }
  # The journey records each vendor step; Firebase is checked against its own log.
  if [[ -s "${OUT}/vendor-steps.jsonl" ]]; then
    python3 "${BARE_DIR}/scripts/verify-vendor-firebase.py" "${OUT}" "${PLATFORM}" > "${OUT}/vendor-firebase-verification.log" 2>&1 || result=1
  fi
  python3 "${APP_DIR}/scripts/vendor-e2e-result.py" "${OUT}" "${PLATFORM}" "${result}" || result=1
  if [[ -n "${CONSUMER}" && "${C15T_KEEP_CONSUMER:-0}" != 1 ]]; then
    rm -rf "$(dirname "${CONSUMER}")"
  fi
  rm -rf "${TASK_TMP}"
  printf 'Expo vendor E2E (%s, %s) exit %s. Evidence: %s\n' "${LABEL}" "${PLATFORM}" "${result}" "${OUT}"
  exit "${result}"
}
trap cleanup EXIT

# An Android step failed: say why, then show what adb and the host saw, so a lost
# emulator or adb connection is not just a bare exit status.
android_failed() {
  set +e
  {
    printf '%s\n' "$1"
    echo '--- adb devices'
    "${ADB}" devices -l
    if kill -0 "${EMULATOR_PID}" 2>/dev/null; then
      echo "--- emulator ${EMULATOR_PID} is still running"
    else
      wait "${EMULATOR_PID}"
      echo "--- emulator ${EMULATOR_PID} exited with status $? (above 128 is 128 + the signal)"
      EMULATOR_PID=""
    fi
    echo "--- last 40 lines of ${OUT}/emulator.log"
    tail -n 40 "${OUT}/emulator.log"
    echo "--- last 40 lines of the guest log, ${OUT}/emulator-logcat.log"
    tail -n 40 "${OUT}/emulator-logcat.log"
    if [[ -n "${EMULATOR_PID}" ]]; then
      # Evidence only: the run still fails. Does an offline device come back?
      "${ADB}" reconnect offline
      for attempt in {1..10}; do
        [[ "$("${ADB}" -s "${DEVICE}" get-state 2>/dev/null)" != device ]] || break
        sleep 1
      done
      echo "--- after adb reconnect offline and ${attempt} s: $("${ADB}" -s "${DEVICE}" get-state 2>&1)"
    fi
    echo '--- memory'
    free -m 2>/dev/null || vm_stat
    sudo -n dmesg 2>/dev/null | grep -iE 'out of memory|killed process|oom' | tail -n 20
  } >&2
  exit 1
}

# Both streams start from the device's log buffer, so a restarted stream loses nothing.
start_log_streams() {
  "${ADB}" -s "${DEVICE}" logcat -v threadtime > "${OUT}/device.log" 2>&1 &
  LOG_PID=$!
  # Epoch timestamps line Firebase's state up with the probe times the app reports.
  "${ADB}" -s "${DEVICE}" logcat -v epoch -s FA:V FA-SVC:V > "${OUT}/firebase.log" 2>&1 &
  FIREBASE_LOG_PID=$!
}

install_apk() {
  "${ADB}" -s "${DEVICE}" install -r "${APP}/android/app/build/outputs/apk/release/app-release.apk" > "${OUT}/install-apk.log" 2>&1
}

# On Depot CI the emulator's adb connection sometimes drops right after boot, about
# one job in ten: adb still lists the device, but offline, and the install fails.
# The cause is unknown; memory, crashes, guest init and log streaming are ruled out.
# `adb reconnect offline` brings the device back in about 2 s. Recover once, say so
# as a CI warning and in adb-recovered.txt, and fail as before if that does not work.
recover_offline_device() {
  [[ "$("${ADB}" -s "${DEVICE}" get-state 2>/dev/null)" == offline ]] || return 1
  echo "::warning title=Android emulator went offline (${LABEL})::adb lost the emulator before the install. Reconnecting and retrying the install once."
  printf '%s adb lost the emulator before the install; reconnecting\n' "$(date -u +%FT%TZ)" >> "${OUT}/adb-recovered.txt"
  "${ADB}" reconnect offline > /dev/null 2>&1 || true
  for _ in {1..30}; do
    [[ "$("${ADB}" -s "${DEVICE}" get-state 2>/dev/null)" != device ]] || break
    sleep 1
  done
  [[ "$("${ADB}" -s "${DEVICE}" get-state 2>/dev/null)" == device ]] || return 1
  # The new connection has no reverse port and ended the log streams; restore both.
  "${ADB}" -s "${DEVICE}" reverse tcp:3000 "tcp:${BACKEND_PORT}"
  for pid in "${LOG_PID}" "${FIREBASE_LOG_PID}"; do
    kill "${pid}" 2>/dev/null || true
    wait "${pid}" 2>/dev/null || true
  done
  start_log_streams
  printf '%s device back online; retrying the install\n' "$(date -u +%FT%TZ)" >> "${OUT}/adb-recovered.txt"
}

# With DEVELOPER_DIR set, python3 runs the selected Xcode's interpreter, whose first
# launch on a fresh machine can be slow. Record it and bound it so a stuck launch
# fails clearly instead of looking like a backend that never started.
STARTED="${SECONDS}"
perl -e 'alarm 90; exec @ARGV' python3 -c 'import sys; print(sys.executable, sys.version.split()[0])' > "${OUT}/python.txt" 2>&1 \
  || { echo "python3 did not start within 90 s:" >&2; cat "${OUT}/python.txt" >&2; exit 1; }
echo "first launch: $(( SECONDS - STARTED )) s" >> "${OUT}/python.txt"
cat "${OUT}/python.txt"

# Binding fails on an occupied test port. Never reuse an unknown backend.
STARTED="${SECONDS}"
python3 "${BARE_DIR}/scripts/e2e-backend.py" --out "${OUT}" --port "${BACKEND_PORT}" --scenario category > "${OUT}/backend.log" 2>&1 &
BACKEND_PID=$!
for attempt in {1..240}; do
  kill -0 "${BACKEND_PID}" || { cat "${OUT}/backend.log"; exit 1; }
  [[ ! -e "${OUT}/backend-ready" ]] || break
  sleep 0.25
done
if [[ ! -e "${OUT}/backend-ready" ]]; then
  echo "Backend not ready after $(( SECONDS - STARTED )) s." >&2
  ps -o pid,stat,etime,command -p "${BACKEND_PID}" >&2 || true
  cat "${OUT}/backend.log" >&2
  exit 1
fi
echo "backend ready after $(( SECONDS - STARTED )) s" | tee -a "${OUT}/python.txt"
curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" > "${OUT}/backend-health.json"

cd "${REPO_ROOT}"
git rev-parse HEAD > "${OUT}/source-head.txt"
git diff --stat > "${OUT}/source-diff.txt"
bun turbo run build --filter=@inth/react-native --filter=@inth/sdk-schema > "${OUT}/dependencies.log" 2>&1

# The URL the app dials. Android reaches the host through adb reverse on its own port 3000.
if [[ "${PLATFORM}" == android ]]; then
  APP_URL=http://localhost:3000
  # Mixpanel's Android SDK sends nothing to a host that resolves to loopback, so it
  # reaches the same backend through the emulator's alias for the host machine.
  MIXPANEL_URL="http://10.0.2.2:${BACKEND_PORT}"
else
  APP_URL="http://localhost:${BACKEND_PORT}"
  MIXPANEL_URL="${APP_URL}"
fi
mkdir -p "${OUT}/policy-assets"
C15T_E2E_BINDING="${APP_URL}" C15T_E2E_FETCH="http://localhost:${BACKEND_PORT}" \
  bunx tsx scripts/export-mobile-e2e-policy.ts "${OUT}/policy-assets/inth-policy.json"

export CI=1 EXPO_NO_TELEMETRY=1 SENTRY_DISABLE_AUTO_UPLOAD=true C15T_LOCAL_PODS=false
export EXPO_PUBLIC_C15T_APP_E2E=1 EXPO_PUBLIC_C15T_FAKE_NATIVE=false
export EXPO_PUBLIC_INTH_PROJECT_URL="${APP_URL}/api/self-host"
export EXPO_PUBLIC_C15T_E2E_URL="${APP_URL}" EXPO_PUBLIC_C15T_E2E_MIXPANEL_URL="${MIXPANEL_URL}"
export C15T_E2E_POLICY="${OUT}/policy-assets/inth-policy.json"

if [[ -n "${CELL}" ]]; then
  # A packed consumer at the cell's versions, outside the checkout.
  CONSUMER="$(mktemp -d "${C15T_EXPO_CONSUMER_ROOT:-${HOME}}/inth-expo-${CELL}.XXXXXX")/app"
  # pnpm, not `bun pm pack`: the workspace is a pnpm install, so only pnpm can
  # resolve the package's `workspace:` dependency versions.
  (cd "${REPO_ROOT}/packages/react-native" && pnpm --config.ignore-scripts=true pack --out "${OUT}/inth-react-native.tgz") > "${OUT}/pack.log" 2>&1
  python3 "${APP_DIR}/scripts/prepare-packed-consumer.py" --package "${OUT}/inth-react-native.tgz" --output "${CONSUMER}" --cell "${CELL}" > "${OUT}/consumer.json"
  APP="${CONSUMER}"
  (cd "${APP}" && bun install) > "${OUT}/install.log" 2>&1
  cp "${APP}/package.json" "${OUT}/consumer-package.json"
  cp "${APP}/bun.lock" "${OUT}/consumer-bun.lock"
else
  APP="${APP_DIR}"
fi
printf '%s\n' "${APP}" > "${OUT}/app-dir.txt"
node - "${APP}" > "${OUT}/versions.json" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const app = process.argv[2];
// Some packages do not export package.json, so read it from the install itself.
const installed = (name) => {
  for (let dir = app; ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'node_modules', name, 'package.json');
    if (fs.existsSync(manifest)) return JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
    if (dir === path.dirname(dir)) throw new Error(`${name} is not installed for ${app}`);
  }
};
const names = ['expo', 'react', 'react-native', 'expo-build-properties', 'expo-constants', 'expo-dev-client',
  '@inth/react-native', 'posthog-react-native', 'mixpanel-react-native', '@amplitude/analytics-react-native',
  '@sentry/react-native', '@react-native-firebase/app', '@react-native-firebase/analytics',
  '@react-native-async-storage/async-storage', 'react-native-get-random-values'];
const versions = {};
for (const name of names) {
  versions[name] = installed(name);
}
process.stdout.write(`${JSON.stringify(versions, null, 2)}\n`);
NODE
cat "${OUT}/versions.json"

if [[ "${PLATFORM}" == ios ]]; then
  (cd "${APP}" && bun x expo prebuild --platform ios --clean) > "${OUT}/prebuild.log" 2>&1
  # Expo SDK 58 generates a SceneDelegate, so that app runs on the newest iOS. Older
  # SDKs do not adopt the UIScene lifecycle, and iOS 27 stops such an app built with
  # the iOS 27 SDK, so they get the oldest available iOS, as the bare runner picks.
  PICK=oldest
  if compgen -G "${APP}/ios/*/SceneDelegate.swift" > /dev/null; then PICK=newest; fi
  printf '%s\n' "${PICK}" > "${OUT}/runtime-pick.txt"
  SIM_DEVICE="${C15T_IOS_DEVICE:-iPhone 17 Pro}"
  # Only runtimes that can run the device (Xcode also ships device-specific ones) and
  # that the selected Xcode's simulator SDK supports: a runner can carry newer
  # runtimes than its pinned Xcode, as run-vendor-e2e.sh notes.
  RUNTIME="${C15T_IOS_RUNTIME:-$(xcrun simctl list runtimes -j | PICK="${PICK}" SIM_DEVICE="${SIM_DEVICE}" \
    SIM_SDK="$(xcrun --sdk iphonesimulator --show-sdk-version)" python3 -c 'import json,os,sys
version=lambda text: tuple(int(part) for part in text.split(".")[:2])
sdk=version(os.environ["SIM_SDK"])
ios=sorted((version(r["version"]), r["identifier"]) for r in json.load(sys.stdin)["runtimes"]
  if r["isAvailable"] and r["name"].startswith("iOS") and version(r["version"]) <= sdk
  and os.environ["SIM_DEVICE"] in [d["name"] for d in r.get("supportedDeviceTypes", [])])
if not ios: raise SystemExit("No iOS runtime at or below SDK " + os.environ["SIM_SDK"] + " runs " + os.environ["SIM_DEVICE"])
print(ios[-1 if os.environ["PICK"] == "newest" else 0][1])')}"
  DEVICE="$(xcrun simctl create "inth-expo-e2e-${LABEL}-${RUN_ID}" "${SIM_DEVICE}" "${RUNTIME}")"
  printf '%s\n' "${DEVICE}" > "${OUT}/device-id.txt"
  printf '%s\n' "${RUNTIME}" > "${OUT}/device-version.txt"
  xcodebuild -version > "${OUT}/toolchain.txt"
  xcrun simctl boot "${DEVICE}"
  xcrun simctl bootstatus "${DEVICE}" -b > "${OUT}/boot.log" 2>&1
  xcrun simctl ui "${DEVICE}" appearance light
  DERIVED="${C15T_APP_E2E_DERIVED:-${OUT}/derived}"
  # Keep the ad-hoc signature: an unsigned Simulator app cannot write the Keychain.
  xcodebuild build -workspace "${APP}/ios/inthExpoDev.xcworkspace" -scheme inthExpoDev \
    -configuration Release -destination "platform=iOS Simulator,id=${DEVICE}" \
    -derivedDataPath "${DERIVED}" \
    CODE_SIGNING_ALLOWED=YES CODE_SIGNING_FOR_SIMULATOR=YES CODE_SIGN_IDENTITY=- \
    ONLY_ACTIVE_ARCH=YES > "${OUT}/build.log" 2>&1
  APP_BUNDLE="${DERIVED}/Build/Products/Release-iphonesimulator/inthExpoDev.app"
  xcrun simctl install "${DEVICE}" "${APP_BUNDLE}"
  # An external UI test bundle drives the installed app, as packed-launch-ios.py does.
  HARNESS="${OUT}/harness"
  mkdir -p "${HARNESS}"
  printf 'import UIKit\n@main class Host: UIResponder, UIApplicationDelegate { var window: UIWindow? }\n' > "${HARNESS}/host.swift"
  cp "${APP_DIR}/scripts/vendor-journey.swift" "${HARNESS}/journey.swift"
  cat > "${HARNESS}/project.json" <<'JSON'
{"name": "VendorJourney", "options": {"deploymentTarget": {"iOS": "16.4"}},
 "settings": {"base": {"SWIFT_VERSION": "5.0", "CODE_SIGN_IDENTITY": "-", "CODE_SIGNING_FOR_SIMULATOR": "YES", "GENERATE_INFOPLIST_FILE": "YES"}},
 "targets": {
  "Host": {"type": "application", "platform": "iOS", "sources": ["host.swift"], "settings": {"base": {"PRODUCT_BUNDLE_IDENTIFIER": "com.inth.vendor-journey-host"}}},
  "Journey": {"type": "bundle.ui-testing", "platform": "iOS", "sources": ["journey.swift"], "dependencies": [{"target": "Host"}],
   "settings": {"base": {"PRODUCT_BUNDLE_IDENTIFIER": "com.inth.vendor-journey-tests", "TEST_TARGET_NAME": "Host"}}}},
 "schemes": {"VendorJourney": {"build": {"targets": {"Host": "all", "Journey": ["test"]}}, "test": {"targets": ["Journey"]}}}}
JSON
  xcodegen generate --spec "${HARNESS}/project.json" > "${OUT}/harness-project.log" 2>&1
  xcodebuild build-for-testing -project "${HARNESS}/VendorJourney.xcodeproj" -scheme VendorJourney \
    -configuration Release -destination "platform=iOS Simulator,id=${DEVICE}" \
    -derivedDataPath "${OUT}/harness-derived" ONLY_ACTIVE_ARCH=YES > "${OUT}/harness-build.log" 2>&1
  XCTESTRUN="$(find "${OUT}/harness-derived/Build/Products" -maxdepth 1 -name '*.xctestrun' -print -quit)"
  python3 - "${XCTESTRUN}" "${APP_BUNDLE}" "${APP_URL}" <<'PYRUN'
import plistlib,sys
path,app,url=sys.argv[1:]
data=plistlib.loads(open(path,'rb').read())
def update(value):
  if isinstance(value,dict):
    if 'TestBundlePath' in value:
      value['UITargetAppPath']=app
      value['UITargetAppBundleIdentifier']='com.inth.expodev'
      value.setdefault('EnvironmentVariables',{})['C15T_E2E_URL']=url
    for child in list(value.values()): update(child)
  elif isinstance(value,list):
    for child in value: update(child)
update(data)
open(path,'wb').write(plistlib.dumps(data))
PYRUN
  # Firebase cannot be redirected; its debug log (the journey launches with
  # -FIRDebugEnabled -FIRAnalyticsDebugEnabled) is the evidence for its consent state.
  xcrun simctl spawn "${DEVICE}" log stream --level debug --style compact --predicate 'process == "inthExpoDev"' > "${OUT}/app-stream.log" 2>&1 &
  LOG_PID=$!
  xcrun simctl io "${DEVICE}" recordVideo --codec=h264 "${OUT}/journey.mp4" > "${OUT}/video.log" 2>&1 &
  VIDEO_PID=$!
  xcodebuild test-without-building -xctestrun "${XCTESTRUN}" \
    -destination "platform=iOS Simulator,id=${DEVICE}" \
    -resultBundlePath "${OUT}/journey.xcresult" -parallel-testing-enabled NO \
    -collect-test-diagnostics never \
    -test-timeouts-enabled YES -default-test-execution-time-allowance 600 > "${OUT}/test.log" 2>&1
else
  export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Library/Android/sdk}"
  ADB="${ANDROID_HOME}/platform-tools/adb"
  AVDMANAGER="${ANDROID_HOME}/cmdline-tools/latest/bin/avdmanager"
  IMAGE="${C15T_ANDROID_IMAGE:-system-images;android-36;google_apis;arm64-v8a}"
  ARCH="${C15T_ANDROID_ARCH:-arm64-v8a}"
  export C15T_MAVEN_URL="file://${REPO_ROOT}/packages/android/build/maven-staging"
  sh "${REPO_ROOT}/packages/android/gradlew" -p "${REPO_ROOT}/packages/android" --max-workers=4 \
    :inth-core:publishAllPublicationsToStagingRepository :inth-android:publishAllPublicationsToStagingRepository :inth-consent-ui:publishAllPublicationsToStagingRepository > "${OUT}/native-artifacts.log" 2>&1
  (cd "${APP}" && bun x expo prebuild --platform android --clean --no-install) > "${OUT}/prebuild.log" 2>&1
  sh "${APP}/android/gradlew" -p "${APP}/android" --refresh-dependencies :app:assembleRelease \
    -PreactNativeArchitectures="${ARCH}" > "${OUT}/build.log" 2>&1
  # The journey must run on R8 output, as users' Release builds do. R8 writes this map.
  MAPPING="${APP}/android/app/build/outputs/mapping/release/mapping.txt"
  [[ -s "${MAPPING}" ]] || { echo "The Release build did not run R8: no ${MAPPING}" >&2; exit 1; }
  # Kept to read obfuscated stack traces from the journey logs.
  gzip -c "${MAPPING}" > "${OUT}/r8-mapping.txt.gz"
  AVD_NAME="inth-expo-e2e-${LABEL}-${RUN_ID}"
  echo no | "${AVDMANAGER}" create avd --name "${AVD_NAME}" --package "${IMAGE}" --device pixel_6 > "${OUT}/avd.log" 2>&1
  # Start above the default 5554 so a developer's own emulator keeps its port.
  PORT="$(python3 -c 'import socket
for p in range(5560, 5586, 2):
 s=socket.socket()
 try: s.bind(("127.0.0.1",p)); print(p); break
 except OSError: pass
 finally: s.close()')"
  DEVICE="emulator-${PORT}"
  printf '%s\n' "${DEVICE}" > "${OUT}/device-id.txt"
  # The emulator writes the guest log itself, so it survives a lost adb connection.
  "${ANDROID_HOME}/emulator/emulator" -avd "${AVD_NAME}" -port "${PORT}" -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect \
    -logcat "*:v" -logcat-output "${OUT}/emulator-logcat.log" > "${OUT}/emulator.log" 2>&1 &
  EMULATOR_PID=$!
  # Poll rather than `adb wait-for-device`, which never returns if the emulator exits.
  STARTED="${SECONDS}"
  for attempt in {1..240}; do
    kill -0 "${EMULATOR_PID}" 2>/dev/null || android_failed "The emulator exited before it finished booting."
    [[ "$("${ADB}" -s "${DEVICE}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != 1 ]] || break
    sleep 1
  done
  [[ "$("${ADB}" -s "${DEVICE}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] \
    || android_failed "The emulator did not finish booting after $(( SECONDS - STARTED )) s."
  "${ADB}" -s "${DEVICE}" shell getprop ro.build.version.sdk > "${OUT}/device-version.txt"
  java -version > "${OUT}/toolchain.txt" 2>&1
  "${ADB}" -s "${DEVICE}" shell settings put system screen_off_timeout 2147483647
  "${ADB}" -s "${DEVICE}" shell svc power stayon true
  "${ADB}" -s "${DEVICE}" shell input keyevent 224
  "${ADB}" -s "${DEVICE}" shell input keyevent 82
  for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
    "${ADB}" -s "${DEVICE}" shell settings put global "${setting}" 0
  done
  "${ADB}" -s "${DEVICE}" reverse tcp:3000 "tcp:${BACKEND_PORT}"
  # Firebase cannot be redirected; its verbose log is the evidence for its consent state.
  "${ADB}" -s "${DEVICE}" shell setprop log.tag.FA VERBOSE
  "${ADB}" -s "${DEVICE}" shell setprop log.tag.FA-SVC VERBOSE
  start_log_streams
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
  install_apk || { recover_offline_device && install_apk; } \
    || android_failed "adb install failed: $(tail -n 1 "${OUT}/install-apk.log")"
  ANDROID_HOME="${ANDROID_HOME}" python3 "${APP_DIR}/scripts/vendor-journey-android.py" \
    --serial "${DEVICE}" --backend "http://127.0.0.1:${BACKEND_PORT}" --out "${OUT}" > "${OUT}/test.log" 2>&1
fi
