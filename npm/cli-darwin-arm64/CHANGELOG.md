## @inth/cli-darwin-arm64@0.0.6

### Explain why the credential store is unavailable

When the system credential store can't be reached, `--json` output now returns `credential_store_unavailable` instead of `command_failed`, including from `inth logout`. These failures are no longer sent to error reporting.

On Linux, the message now names the cause: libsecret is missing, the session bus can't be reached, or no Secret Service is running. Inside Codex's sandbox, which blocks the session bus, the CLI returns `sandbox_restricted` and says to run the command outside the sandbox, as it already does for Cursor.

### Try c15t v3 setup with `inth c15t` (experimental)

Set `INTH_EXPERIMENTAL_C15T=1` to enable `inth c15t`, which sets up c15t v3 in the current app. Choose an Inth project or create one, then pick how to set up c15t: start a coding agent (Codex, Claude Code, Cursor, Grok, or fx) with the c15t setup prompt, add the c15t files to the app and install its packages, or print the prompt for another agent. `--codex`, `--claude`, `--cursor`, `--grok`, and `--fx` start that agent directly. `inth c15t scaffold` and `inth c15t prompt` support `--json` for scripts.

The command uses c15t v3 prereleases and stays hidden from help until v3 ships. Without the variable, `inth c15t` remains an unknown command.

## @inth/cli-darwin-arm64@0.0.5

### Update the CLI with `inth update`

Install on macOS or Linux without Node.js: `curl -fsSL https://inth.com/cli/install.sh | sh`.

`inth update` installs the latest release the way the CLI was installed: with the install script, or with a global npm, pnpm, bun, or Yarn installation. `inth update --check` reports whether a release is available. Interactive commands check npm at most once a day and print a notice when a newer release exists. Set `INTH_UPDATE_CHECK_DISABLED=1` or `NO_UPDATE_NOTIFIER=1` to turn the check off.

## @inth/cli-darwin-arm64@0.0.4

### Send feedback from the CLI

Add `inth feedback` to report Inth failures, documentation mismatches, and feature requests. Supports structured flags, JSON bodies and output, and existing sign-ins and API keys. Only category and message are required. The API deduplicates identical reports from the same caller within a UTC day. Rate-limit errors return immediately without waiting or retrying.

## @inth/cli-darwin-arm64@0.0.3

### Explain failures inside Cursor's agent sandbox

When Cursor's sandbox blocks the CLI state directory, the system credential store, or the Inth API, the CLI now returns the `sandbox_restricted` error code. The message names the likely block and asks you to run the command outside the sandbox. The install docs also explain how to install from a sandboxed agent terminal, including npm's misleading report of a root-owned cache.

## @inth/cli-darwin-arm64@0.0.2

### Sign the macOS binary with a Developer ID

The Apple silicon binary is now signed with a Developer ID certificate and the hardened runtime. When you choose **Always Allow** at the Keychain prompt, the approval now carries over to later CLI updates instead of prompting again after each upgrade.

## @inth/cli-darwin-arm64@0.0.1

### Store credentials and preferences under `com.inth.cli`

Sign-ins are now saved under the `com.inth.cli` credential service instead of `com.inth.cli.scriptc`. Preferences move to `~/Library/Application Support/com.inth.cli` on macOS and `%APPDATA%\com.inth.cli` on Windows. Linux keeps `$XDG_STATE_HOME/inth`.

Existing sign-ins and organization preferences are not migrated. Run `inth login` once after upgrading. On macOS, you can delete the old `com.inth.cli.scriptc` item in Keychain Access and the `inth-scriptc` folder.

## @inth/cli-darwin-arm64@0.0.0

### Publish the Inth CLI

Install `@inth/cli` to run the Inth CLI on Apple silicon Macs, Linux arm64/x64, or Windows x64. The package selects the native executable for your platform.
