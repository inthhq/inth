#!/usr/bin/env bash
# Real vendor SDK journey for the iOS demo: PostHog, Mixpanel, Sentry Replay and Firebase
# Analytics against the Inth Swift helpers. Starts the capture server, generates the
# XcodeGen project, runs VendorSDKTests per scheme on a dedicated simulator, and checks
# Firebase's own debug log. Evidence lands in $C15T_VENDOR_E2E_OUT (or .artifacts/).
#
#   bash examples/native/consent-demo/ios/run-vendor-e2e.sh
#
# C15T_VENDOR_SCHEMES      schemes to run (default: "InthConsentDemo InthUIKitDemo")
# C15T_IOS_VENDOR_DEVICE   simulator name, created when missing (default: inth-ios-vendors)
# C15T_IOS_DEVICE          device type for a new simulator (default: iPhone 17 Pro)
# C15T_IOS_RUNTIME         runtime identifier for a new simulator (default: newest iOS)
# C15T_VENDOR_SPM_DIR      cloned SwiftPM packages, kept between runs for speed
set -euo pipefail
IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${IOS_DIR}/../../../.." && pwd)"
RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
OUT="${C15T_VENDOR_E2E_OUT:-${IOS_DIR}/.artifacts/vendor-e2e/${RUN_ID}}"
mkdir -p "${OUT}"
OUT="$(cd "${OUT}" && pwd)"
[[ -z "$(ls -A "${OUT}")" ]] || { echo "Use an empty evidence directory: ${OUT}" >&2; exit 2; }
SCHEMES="${C15T_VENDOR_SCHEMES:-InthConsentDemo InthUIKitDemo}"
DEVICE_NAME="${C15T_IOS_VENDOR_DEVICE:-inth-ios-vendors}"
SPM_DIR="${C15T_VENDOR_SPM_DIR:-${HOME}/Library/Caches/inth-ios-vendor-sdks/SourcePackages}"
WORK="$(mktemp -d /tmp/inth-vendor-e2e.XXXXXX)"
CAPTURE_PID=""; DEVICE=""; LOG_PID=""
# Firebase cannot reach the capture server; its own debug log is the evidence. Debug
# messages are never persisted, so the log is streamed while the tests run.
LOG_PREDICATE='subsystem == "com.inth.vendor-e2e" OR subsystem BEGINSWITH "com.google.firebase"'

cleanup() {
  result=$?
  trap - EXIT
  set +e
  if [[ -n "${LOG_PID}" ]]; then
    kill "${LOG_PID}"
    wait "${LOG_PID}" 2>/dev/null
  fi
  if [[ -n "${DEVICE}" ]]; then
    xcrun simctl io "${DEVICE}" screenshot "${OUT}/final.png" > /dev/null 2>&1
    if [[ "${result}" == 0 ]]; then
      python3 "${REPO_ROOT}/scripts/vendor-firebase-log.py" "${OUT}/device-log.ndjson" "${OUT}/firebase-evidence.json" \
        --expect "${SCHEMES// /,}" \
        > "${OUT}/firebase-check.log" 2>&1 || result=1
      cat "${OUT}/firebase-check.log"
    fi
    # The simulator is this lane's own; leave other simulators alone.
    xcrun simctl shutdown "${DEVICE}" > /dev/null 2>&1
  fi
  [[ -z "${CAPTURE_PID}" ]] || { kill "${CAPTURE_PID}"; wait "${CAPTURE_PID}" 2>/dev/null; }
  rm -rf "${WORK}"
  printf 'Vendor SDK E2E exit %s. Evidence: %s\n' "${result}" "${OUT}"
  exit "${result}"
}
trap cleanup EXIT

# With DEVELOPER_DIR set, /usr/bin/python3 runs the selected Xcode's Python, and its
# first launch on a fresh machine can take a long time. Record which interpreter ran
# and how long its first launch took, and bound it so a stuck launch fails clearly.
PYTHON="$(command -v python3)"
STARTED="${SECONDS}"
perl -e 'alarm 90; exec @ARGV' "${PYTHON}" -c 'import sys; print(sys.executable, sys.version.split()[0])' > "${OUT}/python.txt" 2>&1 \
  || { echo "python3 did not start within 90 s:" >&2; cat "${OUT}/python.txt" >&2; exit 1; }
echo "first launch: $(( SECONDS - STARTED )) s (${PYTHON})" >> "${OUT}/python.txt"
cat "${OUT}/python.txt"

# Port 0 lets the OS pick a free port; the server reports it in vendor-capture-ready.
STARTED="${SECONDS}"
"${PYTHON}" "${REPO_ROOT}/scripts/vendor_capture.py" --port "${C15T_VENDOR_PORT:-0}" --out "${OUT}" > "${OUT}/capture.log" 2>&1 &
CAPTURE_PID=$!
for _ in $(seq 1 240); do
  kill -0 "${CAPTURE_PID}" || { cat "${OUT}/capture.log"; exit 1; }
  [[ ! -e "${OUT}/vendor-capture-ready" ]] || break
  sleep 0.25
done
if [[ ! -e "${OUT}/vendor-capture-ready" ]]; then
  echo "Capture server not ready after $(( SECONDS - STARTED )) s." >&2
  ps -o pid,stat,etime,command -p "${CAPTURE_PID}" >&2 || true
  cat "${OUT}/capture.log" >&2
  exit 1
fi
echo "capture server ready after $(( SECONDS - STARTED )) s" | tee -a "${OUT}/python.txt"
PORT="$(cat "${OUT}/vendor-capture-ready")"
BASE="http://localhost:${PORT}"
curl -fsS "${BASE}/health" > /dev/null

cd "${REPO_ROOT}"
git rev-parse HEAD > "${OUT}/source-head.txt"
xcodebuild -version > "${OUT}/toolchain.txt"
bun "${IOS_DIR}/generate-project.ts" "${WORK}/project" > "${OUT}/generate.log" 2>&1

DEVICE="$(xcrun simctl list devices -j | python3 -c '
import json, sys
name = sys.argv[1]
for runtime, devices in json.load(sys.stdin)["devices"].items():
    for device in devices:
        if device["name"] == name and device.get("isAvailable"):
            print(device["udid"]); raise SystemExit
' "${DEVICE_NAME}")"
if [[ -z "${DEVICE}" ]]; then
  DEVICE_TYPE="${C15T_IOS_DEVICE:-iPhone 17 Pro}"
  # Newest iOS runtime that runs this device type and that the selected Xcode's simulator
  # SDK supports. A runner can carry newer runtimes than its pinned Xcode.
  RUNTIME="${C15T_IOS_RUNTIME:-$(xcrun simctl list runtimes -j | python3 -c '
import json, sys
version = lambda text: tuple(int(part) for part in text.split(".")[:2])
sdk, device = version(sys.argv[1]), sys.argv[2]
runtimes = [r for r in json.load(sys.stdin)["runtimes"]
            if r["isAvailable"] and r["name"].startswith("iOS") and version(r["version"]) <= sdk
            and any(kind["name"] == device for kind in r.get("supportedDeviceTypes", []))]
if not runtimes:
    raise SystemExit(f"No iOS runtime at or below SDK {sys.argv[1]} runs {device}")
print(max(runtimes, key=lambda r: version(r["version"]))["identifier"])
' "$(xcrun --sdk iphonesimulator --show-sdk-version)" "${DEVICE_TYPE}")}"
  DEVICE="$(xcrun simctl create "${DEVICE_NAME}" "${DEVICE_TYPE}" "${RUNTIME}")"
fi
# A fresh install means fresh vendor SDK storage too, so start from an erased device.
xcrun simctl shutdown "${DEVICE}" > /dev/null 2>&1 || true
xcrun simctl erase "${DEVICE}"
xcrun simctl boot "${DEVICE}"
xcrun simctl bootstatus "${DEVICE}" -b > "${OUT}/boot.log" 2>&1
xcrun simctl list devices -j | python3 -c '
import json, sys
for runtime, devices in json.load(sys.stdin)["devices"].items():
    for device in devices:
        if device["udid"] == sys.argv[1]:
            print(device["name"], device["deviceTypeIdentifier"], runtime)
' "${DEVICE}" > "${OUT}/device.txt"
xcrun simctl spawn "${DEVICE}" log stream --level debug --style ndjson --predicate "${LOG_PREDICATE}" \
  > "${OUT}/device-log.ndjson" 2> "${OUT}/device-log.err" &
LOG_PID=$!

for scheme in ${SCHEMES}; do
  # TEST_RUNNER_ variables reach the XCUITest runner, which passes them on to the app.
  TEST_RUNNER_C15T_VENDOR_BASE="${BASE}" TEST_RUNNER_C15T_CAPTURE_DIR="${OUT}/${scheme}" \
  xcodebuild test -project "${WORK}/project/InthConsentDemo.xcodeproj" -scheme "${scheme}" \
    -destination "platform=iOS Simulator,id=${DEVICE}" \
    -only-testing:"${scheme}UITests/VendorSDKTests" \
    -derivedDataPath "${WORK}/derived" -clonedSourcePackagesDirPath "${SPM_DIR}" \
    -resultBundlePath "${OUT}/${scheme}.xcresult" -parallel-testing-enabled NO \
    -test-timeouts-enabled YES -default-test-execution-time-allowance 600 \
    > "${OUT}/${scheme}-test.log" 2>&1 || { tail -n 60 "${OUT}/${scheme}-test.log"; exit 1; }
  grep -E 'vendor-step' "${OUT}/${scheme}-test.log" || true
  # The journey skips itself without C15T_VENDOR_BASE; a skip must not pass as proof.
  xcrun xcresulttool get test-results summary --path "${OUT}/${scheme}.xcresult" --format json \
    > "${OUT}/${scheme}-summary.json"
  python3 -c 'import json, sys
summary = json.load(open(sys.argv[1]))
counts = {key: summary[key] for key in ("passedTests", "failedTests", "skippedTests")}
if counts != {"passedTests": 1, "failedTests": 0, "skippedTests": 0}:
    raise SystemExit(f"{sys.argv[2]}: expected one passing vendor journey, got {counts}")' \
    "${OUT}/${scheme}-summary.json" "${scheme}"
done
