## @inth/cli-darwin-arm64@0.0.7

### Include the installation ID and install method in usage events

Usage events now include the random installation ID as `installation_id`, including events from signed-in users, so installations can be counted separately from people. Signed-in events still use the Inth user ID as their identity, and the installation ID is now linked to it.

Events also include `install_method`, the same check `inth update` uses to choose how to update: `standalone` for the install script's executable, a package manager for global installations, `temporary` for `npx`, `pnpm dlx`, or `bunx`, or `project` for a project dependency.

### Point the c15t setup guide at v3

The bundled `docs/c15t-setup.md` now sets up c15t v3: the `c15t` package with framework subpaths, `@c15t/integrations` for vendor helpers, exact versions resolved from the `alpha` dist-tag, and links to v3.c15t.com. Apps on c15t v2 are pointed at the upgrade guide. The guide previously linked v2 quickstarts, so agents following it installed c15t v2.

### Set up c15t without an experimental flag

`inth c15t` is available by default and appears in CLI help, including JSON command discovery. The generator now uses `@c15t/cli@3.0.0`, writes the v3 framework quickstart files, and installs `c15t@3`. Existing `.env` files stay intact, with instructions for adding or replacing the backend URL assignment. Agent setup prompts use the latest v3 integration guidance.

The setup picker recommends a coding agent first, or a prompt to paste into your agent when none is installed. Help and docs recommend this path to adapt the integration to an existing app and verify consent in a browser. Scaffolding remains available as an explicit choice. Agent prompts keep existing c15t installations on their current major unless the user requests an upgrade.

For existing HTML pages, scaffold only recommends missing inserts. A page that already loads c15t's script receives instructions for adding the preferences link without loading c15t twice.

HTML scaffolding works without `package.json`. JSON scaffold plans expose file paths and existence flags while keeping existing file contents private.

Next.js scaffolding keeps routes in the active `app`, `pages`, `src/app`, or `src/pages` directory. Existing Next.js config files stay intact, with instructions for wrapping their current options in `withConsentManifest`.

Next.js quickstart entry points do not assume an app stylesheet or path alias. Astro autodetection defaults to static output; use `--framework astro` for the server template.

Next.js scaffolding preserves existing JavaScript and TypeScript entry filenames and gives integration instructions without creating competing routes. SvelteKit scaffolds include the adapter imported by the generated Vite config, preserving its declared version or selecting one for the app's SvelteKit major.

React scaffolding uses the default export from Vite's conventional `src/App` component. HTML sites without `package.json` can scaffold on filesystems that do not support hard links, using an exclusive copy and a recovery record while preserving competing files.

SvelteKit scaffolding checks for stable Kit 2.63+ or 3.x before writing files or creating a project. Older apps receive upgrade guidance without changes to their config or package versions.

Next.js Pages Router scaffolding follows literal `pageExtensions` lists, including custom JavaScript and TypeScript suffixes. Nuxt 3 scaffolding uses its root app component and preserves existing config filenames. Computed source paths and unverified SvelteKit ranges receive guidance before file creation.

When a backend variable already exists in `.env`, scaffold tells you to replace its assignment instead of adding a duplicate. The file and unrelated values stay private and unchanged.

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
