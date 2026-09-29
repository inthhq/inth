## @inth/cli@0.0.5

### Update the CLI with `inth update`

Install on macOS or Linux without Node.js: `curl -fsSL https://inth.com/cli/install.sh | sh`.

`inth update` installs the latest release the way the CLI was installed: with the install script, or with a global npm, pnpm, bun, or Yarn installation. `inth update --check` reports whether a release is available. Interactive commands check npm at most once a day and print a notice when a newer release exists. Set `INTH_UPDATE_CHECK_DISABLED=1` or `NO_UPDATE_NOTIFIER=1` to turn the check off.

## @inth/cli@0.0.4

### Send feedback from the CLI

Add `inth feedback` to report Inth failures, documentation mismatches, and feature requests. Supports structured flags, JSON bodies and output, and existing sign-ins and API keys. Only category and message are required. The API deduplicates identical reports from the same caller within a UTC day. Rate-limit errors return immediately without waiting or retrying.

## @inth/cli@0.0.3

### Explain failures inside Cursor's agent sandbox

When Cursor's sandbox blocks the CLI state directory, the system credential store, or the Inth API, the CLI now returns the `sandbox_restricted` error code. The message names the likely block and asks you to run the command outside the sandbox. The install docs also explain how to install from a sandboxed agent terminal, including npm's misleading report of a root-owned cache.

## @inth/cli@0.0.2

### Sign the macOS binary with a Developer ID

The Apple silicon binary is now signed with a Developer ID certificate and the hardened runtime. When you choose **Always Allow** at the Keychain prompt, the approval now carries over to later CLI updates instead of prompting again after each upgrade.

## @inth/cli@0.0.1

### Store credentials and preferences under `com.inth.cli`

Sign-ins are now saved under the `com.inth.cli` credential service instead of `com.inth.cli.scriptc`. Preferences move to `~/Library/Application Support/com.inth.cli` on macOS and `%APPDATA%\com.inth.cli` on Windows. Linux keeps `$XDG_STATE_HOME/inth`.

Existing sign-ins and organization preferences are not migrated. Run `inth login` once after upgrading. On macOS, you can delete the old `com.inth.cli.scriptc` item in Keychain Access and the `inth-scriptc` folder.

## @inth/cli@0.0.0

### Publish the Inth CLI

Install `@inth/cli` to run the Inth CLI on Apple silicon Macs, Linux arm64/x64, or Windows x64. The package selects the native executable for your platform.
