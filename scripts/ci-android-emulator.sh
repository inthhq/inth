#!/usr/bin/env bash
# Boot a headless Android emulator for instrumented suites, or stop it.
#
#   scripts/ci-android-emulator.sh start   # prints nothing; exports ANDROID_SERIAL via GITHUB_ENV when set
#   scripts/ci-android-emulator.sh stop
#
# Needs KVM. GitHub-hosted Linux runners have it.
set -euo pipefail

: "${ANDROID_HOME:?ANDROID_HOME must point at the Android SDK}"
IMAGE="${INTH_ANDROID_IMAGE:-system-images;android-36;google_apis;x86_64}"
AVD_NAME="${INTH_AVD_NAME:-inth-ci}"
PORT="${INTH_EMULATOR_PORT:-5554}"
SERIAL="emulator-${PORT}"
ADB="${ANDROID_HOME}/platform-tools/adb"
LOG_DIR="${INTH_EMULATOR_LOG_DIR:-${RUNNER_TEMP:-/tmp}/android-emulator}"

case "${1:-}" in
start)
	mkdir -p "${LOG_DIR}"
	echo no | "${ANDROID_HOME}/cmdline-tools/latest/bin/avdmanager" create avd \
		--force --name "${AVD_NAME}" --package "${IMAGE}" --device pixel_6 > "${LOG_DIR}/avd.log" 2>&1
	nohup "${ANDROID_HOME}/emulator/emulator" -avd "${AVD_NAME}" -port "${PORT}" \
		-no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -accel on \
		> "${LOG_DIR}/emulator.log" 2>&1 &
	echo $! > "${LOG_DIR}/emulator.pid"
	"${ADB}" -s "${SERIAL}" wait-for-device
	for _ in $(seq 1 240); do
		[[ "$("${ADB}" -s "${SERIAL}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]] && break
		kill -0 "$(cat "${LOG_DIR}/emulator.pid")"
		sleep 1
	done
	[[ "$("${ADB}" -s "${SERIAL}" shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]
	# Keep the screen on and unlocked so Compose and UIAutomator see a resumed activity.
	"${ADB}" -s "${SERIAL}" shell settings put system screen_off_timeout 2147483647
	"${ADB}" -s "${SERIAL}" shell svc power stayon true
	"${ADB}" -s "${SERIAL}" shell input keyevent 224
	"${ADB}" -s "${SERIAL}" shell input keyevent 82
	# Animations make Compose idling flaky on a software-rendered emulator.
	for setting in window_animation_scale transition_animation_scale animator_duration_scale; do
		"${ADB}" -s "${SERIAL}" shell settings put global "${setting}" 0
	done
	if [[ -n "${GITHUB_ENV:-}" ]]; then
		echo "ANDROID_SERIAL=${SERIAL}" >> "${GITHUB_ENV}"
	fi
	;;
stop)
	"${ADB}" -s "${SERIAL}" emu kill > /dev/null 2>&1 || true
	if [[ -f "${LOG_DIR}/emulator.pid" ]]; then
		kill "$(cat "${LOG_DIR}/emulator.pid")" > /dev/null 2>&1 || true
	fi
	;;
*)
	echo "usage: $0 start|stop" >&2
	exit 2
	;;
esac
