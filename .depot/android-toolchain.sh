#!/usr/bin/env bash
# Point a Depot CI sandbox at its preinstalled Android SDK and JDK 17, and add
# the emulator pieces the image leaves out. Exports go through GITHUB_ENV and
# GITHUB_PATH so later steps see them.
set -euo pipefail

sdk="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
jdk="${JAVA_HOME_17_X64:-/usr/lib/jvm/temurin-17-jdk-amd64}"
[[ -d "${sdk}/cmdline-tools/latest/bin" ]] || { echo "No Android SDK at ${sdk}" >&2; exit 1; }
[[ -x "${jdk}/bin/java" ]] || { echo "No JDK 17 at ${jdk}" >&2; exit 1; }

{
	echo "ANDROID_HOME=${sdk}"
	echo "ANDROID_SDK_ROOT=${sdk}"
	echo "JAVA_HOME=${jdk}"
} >> "${GITHUB_ENV}"
{
	echo "${sdk}/cmdline-tools/latest/bin"
	echo "${sdk}/platform-tools"
	echo "${sdk}/emulator"
} >> "${GITHUB_PATH}"

export JAVA_HOME="${jdk}"
sdkmanager="${sdk}/cmdline-tools/latest/bin/sdkmanager"
yes | "${sdkmanager}" --licenses > /dev/null || true
log="${RUNNER_TEMP:-/tmp}/sdkmanager.log"
# The image already carries platform 37 and build-tools 37.0.0; add the pinned
# NDK and the emulator pieces.
image="${INTH_ANDROID_IMAGE:-system-images;android-36;google_apis;x86_64}"
image_dir="${sdk}/${image//;//}"
# Each job downloads the emulator afresh, and a download sometimes arrives
# corrupt ("Error on ZipFile unknown archive"). sdkmanager can report that as a
# warning, so check the installed files rather than its exit status, and retry.
for attempt in 1 2 3; do
	"${sdkmanager}" --install 'ndk;27.1.12297006' 'platform-tools' 'emulator' "${image}" \
		> "${log}" 2>&1 || true
	if [[ -x "${sdk}/emulator/emulator" && -d "${image_dir}" && -d "${sdk}/ndk/27.1.12297006" ]]; then
		break
	fi
	echo "Android SDK install attempt ${attempt} incomplete:" >&2
	tail -n 20 "${log}" >&2
	[[ "${attempt}" -lt 3 ]] || exit 1
	sleep 5
done
sudo chmod 666 /dev/kvm 2>/dev/null || true
