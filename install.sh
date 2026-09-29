#!/bin/sh
# Install the Inth CLI native executable on macOS or Linux.
#
#   curl -fsSL https://inth.com/cli/install.sh | sh
#
# The script downloads the platform package that `npm install -g @inth/cli`
# would select, checks it against the registry's sha512 integrity, and copies
# its `inth` executable into a directory on disk. Node.js is not required.
#
# Environment:
#   INTH_VERSION       Release to install, such as 0.0.4. Defaults to latest.
#   INTH_INSTALL_DIR   Directory for the executable. Defaults to $XDG_BIN_HOME,
#                      then ~/.local/bin.
#   INTH_NPM_REGISTRY  Registry to download from. Defaults to
#                      https://registry.npmjs.org.

set -eu

say() {
  printf '%s\n' "$*"
}

fail() {
  printf 'inth install: %s\n' "$*" >&2
  exit 1
}

has() {
  command -v "$1" >/dev/null 2>&1
}

detect_platform() {
  os=$(uname -s)
  arch=$(uname -m)
  case "$os" in
    Darwin)
      case "$arch" in
        arm64) ;;
        x86_64)
          # A shell running under Rosetta reports x86_64 on Apple silicon.
          if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" != 1 ]; then
            fail "Intel Macs are not supported. The Inth CLI requires an Apple silicon Mac running macOS 14 or newer."
          fi
          ;;
        *) fail "Unsupported macOS architecture: $arch." ;;
      esac
      printf 'darwin-arm64'
      ;;
    Linux)
      if ls /lib/ld-musl-* >/dev/null 2>&1; then
        fail "musl-based Linux distributions such as Alpine are not supported. Use a distribution with glibc 2.36 or newer, such as Debian 12 or Ubuntu 24.04."
      fi
      check_glibc
      case "$arch" in
        x86_64 | amd64) printf 'linux-x64' ;;
        aarch64 | arm64) printf 'linux-arm64' ;;
        *) fail "Unsupported Linux architecture: $arch. Supported architectures are x64 and arm64." ;;
      esac
      ;;
    MINGW* | MSYS* | CYGWIN*)
      fail "This script does not support Windows. Install with npm instead: npm install -g @inth/cli"
      ;;
    *) fail "Unsupported operating system: $os." ;;
  esac
}

check_glibc() {
  # getconf prints "glibc 2.36". Skip the check when it is unavailable and let
  # the smoke test report a loader failure instead.
  glibc=$(getconf GNU_LIBC_VERSION 2>/dev/null || true)
  version=${glibc#glibc }
  [ "$version" != "$glibc" ] || return 0
  major=${version%%.*}
  minor=${version#*.}
  minor=${minor%%.*}
  case "$major$minor" in
    *[!0-9]* | "") return 0 ;;
  esac
  if [ "$major" -lt 2 ] || { [ "$major" -eq 2 ] && [ "$minor" -lt 36 ]; }; then
    fail "glibc $version is too old. The Inth CLI requires glibc 2.36 or newer, such as Debian 12 or Ubuntu 24.04."
  fi
}

fetch() {
  if has curl; then
    curl --fail --silent --show-error --location --retry 3 "$1"
  elif has wget; then
    wget --quiet --output-document=- "$1"
  else
    fail "Install curl or wget, then run this script again."
  fi
}

download() {
  if has curl; then
    curl --fail --silent --show-error --location --retry 3 --output "$2" "$1"
  else
    wget --quiet --output-document="$2" "$1"
  fi
}

# Reads a string field from registry JSON, compact or pretty-printed.
json_field() {
  printf '%s\n' "$2" |
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" |
    head -n 1
}

base64_decode() {
  if printf 'aW50aA==' | base64 -d >/dev/null 2>&1; then
    base64 -d
  elif has openssl; then
    openssl base64 -d -A
  else
    fail "Cannot verify the download. Install base64 or openssl, then run this script again."
  fi
}

sha512_hex() {
  if has sha512sum; then
    sha512sum "$1" | cut -d ' ' -f 1
  elif has shasum; then
    shasum -a 512 "$1" | cut -d ' ' -f 1
  elif has openssl; then
    openssl dgst -sha512 -r "$1" | cut -d ' ' -f 1
  else
    fail "Cannot verify the download. Install sha512sum, shasum, or openssl, then run this script again."
  fi
}

verify_integrity() {
  case "$2" in
    sha512-*) ;;
    *) fail "The registry did not return a sha512 integrity for $package@$version." ;;
  esac
  expected=$(printf '%s' "${2#sha512-}" | base64_decode | od -An -v -tx1 | tr -d ' \n')
  actual=$(sha512_hex "$1")
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    fail "The downloaded archive does not match the registry's sha512 integrity. Nothing was installed."
  fi
}

# Output follows the inth CLI: bold green results, dim row labels, and
# commands on their own line in bold cyan so they copy cleanly.
setup_style() {
  if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != dumb ]; then
    esc=$(printf '\033')
    dim="${esc}[2m"
    green="${esc}[1;32m"
    cyan="${esc}[1;36m"
    reset="${esc}[0m"
  else
    dim=""
    green=""
    cyan=""
    reset=""
  fi
}

# Shortens paths under the home directory to ~ for display.
tilde() {
  case "$1" in
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *) printf '%s' "$1" ;;
  esac
}

platform_label() {
  case "$1" in
    darwin-arm64) printf 'macOS (arm64)' ;;
    linux-x64) printf 'Linux (x64)' ;;
    linux-arm64) printf 'Linux (arm64)' ;;
  esac
}

# Resolves symlinks so /tmp and /private/tmp, for example, compare equal.
physical() {
  (cd "$1" 2>/dev/null && pwd -P) || printf '%s' "$1"
}

on_path() {
  target=$(physical "$1")
  found=1
  old_ifs=$IFS
  IFS=:
  set -f
  for entry in ${PATH:-}; do
    if [ -n "$entry" ] && [ "$(physical "$entry")" = "$target" ]; then
      found=0
      break
    fi
  done
  set +f
  IFS=$old_ifs
  return "$found"
}

say_command() {
  say ""
  say "    $cyan$1$reset"
}

# The shell profile line that adds a directory to PATH. Paths under the home
# directory are written with $HOME so the line stays portable.
path_command() {
  directory=$1
  case "$directory" in
    "$HOME"/*) directory="\$HOME${directory#"$HOME"}" ;;
  esac
  case "$(basename "${SHELL:-sh}")" in
    fish) printf '%s' "fish_add_path \"$directory\"" ;;
    zsh) printf '%s' "echo 'export PATH=\"$directory:\$PATH\"' >> ~/.zshrc" ;;
    bash)
      if [ "$(uname -s)" = Darwin ]; then
        printf '%s' "echo 'export PATH=\"$directory:\$PATH\"' >> ~/.bash_profile"
      else
        printf '%s' "echo 'export PATH=\"$directory:\$PATH\"' >> ~/.bashrc"
      fi
      ;;
    *) printf '%s' "echo 'export PATH=\"$directory:\$PATH\"' >> ~/.profile" ;;
  esac
}

main() {
  version=${INTH_VERSION:-latest}
  registry=${INTH_NPM_REGISTRY:-https://registry.npmjs.org}
  registry=${registry%/}
  install_dir=${INTH_INSTALL_DIR:-${XDG_BIN_HOME:-${HOME:?HOME is not set}/.local/bin}}

  platform=$(detect_platform)
  package="@inth/cli-$platform"
  has tar || fail "Install tar, then run this script again."
  setup_style

  tmp=$(mktemp -d 2>/dev/null || mktemp -d -t inth)
  trap 'rm -rf "$tmp"' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  metadata=$(fetch "$registry/$package/$version") ||
    fail "Could not find $package@$version in $registry."
  target=$(json_field version "$metadata")
  case "$target" in
    [0-9]*) say "Downloading inth $target for $(platform_label "$platform")…" ;;
    *) say "Downloading inth for $(platform_label "$platform")…" ;;
  esac
  tarball=$(json_field tarball "$metadata")
  integrity=$(json_field integrity "$metadata")
  case "$tarball" in
    https://* | http://*) ;;
    *) fail "The registry did not return a download URL for $package@$version." ;;
  esac

  download "$tarball" "$tmp/package.tgz" || fail "Could not download $tarball."
  verify_integrity "$tmp/package.tgz" "$integrity"
  tar -xzf "$tmp/package.tgz" -C "$tmp" package/bin/inth ||
    fail "The downloaded archive does not contain the inth executable."

  # Run the new executable before replacing a working installation.
  installed=$(INTH_TELEMETRY_DISABLED=1 "$tmp/package/bin/inth" --version 2>&1) ||
    fail "The downloaded executable does not run on this system: $installed"

  previous=""
  if [ -x "$install_dir/inth" ]; then
    previous=$(INTH_TELEMETRY_DISABLED=1 "$install_dir/inth" --version 2>/dev/null || true)
  fi

  mkdir -p "$install_dir" || fail "Could not create $install_dir. Set INTH_INSTALL_DIR to a writable directory."
  staged="$install_dir/.inth.$$"
  cp "$tmp/package/bin/inth" "$staged" || fail "Could not write to $install_dir. Set INTH_INSTALL_DIR to a writable directory."
  chmod 755 "$staged"
  mv -f "$staged" "$install_dir/inth"

  location=$(tilde "$install_dir/inth")
  say ""
  if [ -n "$previous" ] && [ "$previous" != "$installed" ]; then
    say "${green}Updated inth $previous → $installed$reset"
    say "  ${dim}Location$reset       $location"
    say "  ${dim}Release notes$reset  https://github.com/inthhq/inth/releases/tag/inth@$installed"
  elif [ -n "$previous" ]; then
    say "${green}Reinstalled inth $installed$reset"
    say "  ${dim}Location$reset  $location"
  else
    say "${green}Installed inth $installed$reset"
    say "  ${dim}Location$reset  $location"
  fi
  if on_path "$install_dir"; then
    resolved=$(command -v inth 2>/dev/null || true)
    if [ -n "$resolved" ] &&
      [ "$(physical "$(dirname "$resolved")")" != "$(physical "$install_dir")" ]; then
      say ""
      say "Another inth at $(tilde "$resolved") comes first on your PATH. Remove it, or move $(tilde "$install_dir") earlier in PATH."
    fi
  else
    say ""
    say "$(tilde "$install_dir") is not on your PATH. Add it, then open a new terminal:"
    say_command "$(path_command "$install_dir")"
  fi
  if [ -z "$previous" ]; then
    say ""
    say "Sign in to get started:"
    say_command "inth login"
  fi
}

main "$@"
