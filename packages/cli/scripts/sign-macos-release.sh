#!/bin/sh
# Signs the macOS npm package for release.
# Uses only system tools. Nothing from the repository, including the binary
# being signed, runs while the signing key is loaded.
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: sign-macos-release.sh <unsigned-package.tgz> <output-directory>" >&2
  exit 1
fi

archive=$1
output=$2
: "${MACOS_CERTIFICATE:?Set MACOS_CERTIFICATE to the base64 Developer ID .p12}"
: "${MACOS_CERTIFICATE_PASSWORD:?Set MACOS_CERTIFICATE_PASSWORD}"
: "${SIGNING_IDENTITY:?Set SIGNING_IDENTITY}"
: "${TEAM_ID:?Set TEAM_ID}"
test -f "$archive"

work=$(/usr/bin/mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/inth-sign.XXXXXX")
keychain="$work/signing.keychain-db"
searchlist="$work/keychains"
/usr/bin/security list-keychains -d user > "$searchlist"
# Set the user keychain search list to the arguments plus the saved list.
set_search_list() {
  while IFS= read -r entry; do
    entry=${entry#*\"}
    set -- "$@" "${entry%\"}"
  done < "$searchlist"
  /usr/bin/security list-keychains -d user -s "$@"
}
cleanup() {
  # Restore the original search list before deleting the temporary keychain.
  set_search_list || true
  /usr/bin/security delete-keychain "$keychain" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 1' INT TERM

password=$(/usr/bin/openssl rand -hex 24)
/usr/bin/security create-keychain -p "$password" "$keychain"
/usr/bin/security set-keychain-settings -lut 3600 "$keychain"
/usr/bin/security unlock-keychain -p "$password" "$keychain"
printf '%s' "$MACOS_CERTIFICATE" | /usr/bin/base64 --decode > "$work/certificate.p12"
/usr/bin/security import "$work/certificate.p12" -k "$keychain" -f pkcs12 \
  -P "$MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign >/dev/null
rm "$work/certificate.p12"
/usr/bin/security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
  -k "$password" "$keychain" >/dev/null
set_search_list "$keychain"

mkdir "$work/package"
/usr/bin/tar -xzf "$archive" -C "$work/package"
binary="$work/package/package/bin/inth"
test -f "$binary"

# Keep the identifier stable so Keychain approvals survive CLI updates.
/usr/bin/codesign --force --sign "$SIGNING_IDENTITY" --keychain "$keychain" \
  --identifier com.inth.cli --options runtime --timestamp "$binary"
requirement="=anchor apple generic and identifier \"com.inth.cli\" and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"$TEAM_ID\""
/usr/bin/codesign --verify --strict --verbose=2 -R "$requirement" "$binary"
/usr/bin/codesign -dv "$binary" 2>&1 | grep -q 'flags=0x10000(runtime)'

mkdir -p "$output"
signed="$output/$(basename "$archive")"
# Keep macOS metadata files out of the npm package.
COPYFILE_DISABLE=1 /usr/bin/tar --no-mac-metadata --no-xattrs -czf "$signed" \
  -C "$work/package" package
if /usr/bin/tar -tzf "$signed" | grep -q '/\._'; then
  echo "Signed package contains macOS metadata files." >&2
  exit 1
fi
echo "Signed $(basename "$archive")."
