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
