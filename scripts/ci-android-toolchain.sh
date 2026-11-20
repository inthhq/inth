#!/usr/bin/env bash
# Point a CI runner at its preinstalled Android SDK and JDK 17, and add what the
# image leaves out. Exports go through GITHUB_ENV and GITHUB_PATH so later steps
# see them.
#
#   scripts/ci-android-toolchain.sh emulator   # boot an emulator: needs KVM; adds the emulator and system image
#   scripts/ci-android-toolchain.sh build      # build the RN and Expo apps: adds the NDK and turns on the Gradle build cache
set -euo pipefail

mode="${1:-emulator}"
case "${mode}" in
emulator | build) ;;
*)
	echo "usage: $0 [emulator|build]" >&2
	exit 2
	;;
esac

if [[ "${mode}" == emulator ]]; then
	sudo chmod 666 /dev/kvm 2>/dev/null || true
	# Without KVM the x86_64 emulator either exits at once or never finishes
	# booting. Stop before the SDK downloads, so a runner without KVM fails in
	# seconds.
	[[ -w /dev/kvm ]] || { echo "::error::This runner has no usable /dev/kvm, so the Android emulator cannot boot." >&2; exit 1; }
fi

sdk="${ANDROID_HOME:-/usr/local/lib/android/sdk}"
jdk="${JAVA_HOME_17_X64:-/usr/lib/jvm/temurin-17-jdk-amd64}"
[[ -d "${sdk}/cmdline-tools/latest/bin" ]] || { echo "No Android SDK at ${sdk}" >&2; exit 1; }
[[ -x "${jdk}/bin/java" ]] || { echo "No JDK 17 at ${jdk}" >&2; exit 1; }
# avdmanager and the emulator can default to different AVD directories (they do
# on GitHub's ubuntu-24.04 image), and then the emulator cannot find the AVD
# avdmanager just made. Both honor ANDROID_AVD_HOME.
avd_home="${ANDROID_AVD_HOME:-${HOME}/.android/avd}"
mkdir -p "${avd_home}"

{
	echo "ANDROID_AVD_HOME=${avd_home}"
	echo "ANDROID_HOME=${sdk}"
	echo "ANDROID_SDK_ROOT=${sdk}"
	echo "JAVA_HOME=${jdk}"
} >> "${GITHUB_ENV}"
{
	echo "${sdk}/cmdline-tools/latest/bin"
	echo "${sdk}/platform-tools"
	echo "${sdk}/emulator"
} >> "${GITHUB_PATH}"

# The image already carries platform 37 and build-tools 37.0.0. Building the RN
# and Expo apps needs the pinned NDK; booting needs the emulator and a system
# image. The workflow can restore these from its cache first.
ndk='ndk;27.1.12297006'
image="${INTH_ANDROID_IMAGE:-system-images;android-36;google_apis;x86_64}"
if [[ "${mode}" == emulator ]]; then
	packages=('platform-tools' 'emulator' "${image}")
	paths=("${sdk}/platform-tools/adb" "${sdk}/emulator/emulator" "${sdk}/${image//;//}")
else
	packages=('platform-tools' "${ndk}")
	paths=("${sdk}/platform-tools/adb" "${sdk}/${ndk//;//}")
fi
installed() {
	local path
	for path in "${paths[@]}"; do
		[[ -e "${path}" ]] || return 1
	done
}

export JAVA_HOME="${jdk}"
sdkmanager="${sdk}/cmdline-tools/latest/bin/sdkmanager"
if installed; then
	echo "Already installed: ${packages[*]}"
else
	yes | "${sdkmanager}" --licenses > /dev/null || true
	log="${RUNNER_TEMP:-/tmp}/sdkmanager.log"
	# A download sometimes arrives corrupt ("Error on ZipFile unknown archive").
	# sdkmanager can report that as a warning, so check the installed files rather
	# than its exit status, and retry.
	for attempt in 1 2 3; do
		"${sdkmanager}" --install "${packages[@]}" > "${log}" 2>&1 || true
		installed && break
		echo "Android SDK install attempt ${attempt} incomplete:" >&2
		tail -n 20 "${log}" >&2
		[[ "${attempt}" -lt 3 ]] || exit 1
		sleep 5
	done
fi

if [[ "${mode}" == emulator ]]; then
	echo "Emulator $(sed -n 's/^Pkg.Revision=//p' "${sdk}/emulator/source.properties"), ${image}"
else
	# Depot CI's preinstalled init.gradle points the build cache at Depot Cache, so
	# this shares task outputs between runs. Elsewhere it is a local cache.
	mkdir -p "${HOME}/.gradle"
	echo 'org.gradle.caching=true' >> "${HOME}/.gradle/gradle.properties"
fi
