#!/usr/bin/env bash
# Captures every consent screen of the custom consent example on an iOS Simulator: the stock
# InthConsentUI screens and the custom ones built on the headless blocks, in light and dark.
# Generates the XcodeGen project, builds once, then launches the app straight onto each screen
# with launch arguments and saves a screenshot. Needs Xcode and XcodeGen.
#
#   bash packages/swift/Examples/custom-consent/capture-screenshots.sh [output directory]
#
# Writes ios-<stock|custom>-<prompt|preferences|iab>-<light|dark>.png, 12 files, and fails if
# one is missing.
#
# INTH_SCREENSHOT_OUT      output directory (default: a inth-custom-consent-screenshots folder in the temp directory)
# INTH_SCREENSHOT_DEVICE   simulator name, created when missing (default: inth-custom-consent)
# INTH_SCREENSHOT_SETTLE   seconds to wait after each launch (default: 6)
# INTH_IOS_DEVICE          device type for a new simulator (default: iPhone 17 Pro)
# INTH_IOS_RUNTIME         runtime identifier for a new simulator (default: newest iOS)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-${INTH_SCREENSHOT_OUT:-${TMPDIR:-/tmp}/inth-custom-consent-screenshots}}"
mkdir -p "${OUT}"
OUT="$(cd "${OUT}" && pwd)"
DEVICE_NAME="${INTH_SCREENSHOT_DEVICE:-inth-custom-consent}"
SETTLE="${INTH_SCREENSHOT_SETTLE:-6}"
BUNDLE_ID=com.inth.examples.customconsent
WORK="$(mktemp -d /tmp/inth-custom-consent.XXXXXX)"
DEVICE=""

cleanup() {
  result=$?
  trap - EXIT
  set +e
  if [[ -n "${DEVICE}" ]]; then
    xcrun simctl ui "${DEVICE}" appearance light > /dev/null 2>&1
    # The simulator is this script's own; leave other simulators alone.
    xcrun simctl shutdown "${DEVICE}" > /dev/null 2>&1
  fi
  rm -rf "${WORK}"
  printf 'Custom consent screenshots exit %s. Output: %s\n' "${result}" "${OUT}"
  exit "${result}"
}
trap cleanup EXIT

command -v xcodegen > /dev/null || { echo "Install XcodeGen first: brew install xcodegen" >&2; exit 2; }
xcodebuild -version

xcodegen generate --spec "${HERE}/project.yml" > "${WORK}/generate.log" 2>&1 || { cat "${WORK}/generate.log" >&2; exit 1; }

DEVICE="$(xcrun simctl list devices -j | python3 -c '
import json, sys
name = sys.argv[1]
for runtime, devices in json.load(sys.stdin)["devices"].items():
    for device in devices:
        if device["name"] == name and device.get("isAvailable"):
            print(device["udid"]); raise SystemExit
' "${DEVICE_NAME}")"
if [[ -z "${DEVICE}" ]]; then
  DEVICE_TYPE="${INTH_IOS_DEVICE:-iPhone 17 Pro}"
  # Newest iOS runtime that runs this device type and that the selected Xcode's simulator
  # SDK supports. A runner can carry newer runtimes than its pinned Xcode.
  RUNTIME="${INTH_IOS_RUNTIME:-$(xcrun simctl list runtimes -j | python3 -c '
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

xcodebuild build -project "${HERE}/InthCustomConsent.xcodeproj" -scheme InthCustomConsent \
  -destination "platform=iOS Simulator,id=${DEVICE}" -derivedDataPath "${WORK}/derived" \
  > "${WORK}/build.log" 2>&1 || { grep -E 'error:|warning: unre' "${WORK}/build.log" >&2; tail -n 60 "${WORK}/build.log" >&2; exit 1; }
APP="${WORK}/derived/Build/Products/Debug-iphonesimulator/InthCustomConsent.app"
[[ -d "${APP}" ]] || { echo "The build produced no app at ${APP}" >&2; exit 1; }

xcrun simctl shutdown "${DEVICE}" > /dev/null 2>&1 || true
xcrun simctl boot "${DEVICE}"
xcrun simctl bootstatus "${DEVICE}" -b > "${WORK}/boot.log" 2>&1
xcrun simctl install "${DEVICE}" "${APP}"
# A steady status bar, so two runs of the same screen differ only where the screen does.
xcrun simctl status_bar "${DEVICE}" override --time 9:41 --batteryState charged --batteryLevel 100 > /dev/null 2>&1 || true

rm -f "${OUT}"/ios-*.png
for appearance in light dark; do
  xcrun simctl ui "${DEVICE}" appearance "${appearance}"
  for ui in stock custom; do
    for screen in prompt preferences iab; do
      arguments=(--screen "${screen}")
      [[ "${ui}" != stock ]] || arguments+=(--stock)
      [[ "${screen}" != iab ]] || arguments+=(--iab)
      xcrun simctl terminate "${DEVICE}" "${BUNDLE_ID}" > /dev/null 2>&1 || true
      xcrun simctl launch "${DEVICE}" "${BUNDLE_ID}" "${arguments[@]}" > /dev/null
      # The store is in memory, so each launch starts with no saved choice. Wait for the
      # fixture policy to load and the screen's own motion to finish.
      sleep "${SETTLE}"
      xcrun simctl io "${DEVICE}" screenshot "${OUT}/ios-${ui}-${screen}-${appearance}.png" > /dev/null
    done
  done
done
xcrun simctl terminate "${DEVICE}" "${BUNDLE_ID}" > /dev/null 2>&1 || true

missing=0
for appearance in light dark; do
  for ui in stock custom; do
    for screen in prompt preferences iab; do
      file="${OUT}/ios-${ui}-${screen}-${appearance}.png"
      if [[ ! -s "${file}" ]]; then
        echo "Missing screenshot: ${file}" >&2
        missing=1
      fi
    done
  done
done
[[ "${missing}" == 0 ]] || exit 1
ls -l "${OUT}"/ios-*.png
