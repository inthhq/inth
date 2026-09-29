---
packages:
  "group:inth": patch
---

### Update the CLI with `inth update`

Install on macOS or Linux without Node.js: `curl -fsSL https://inth.com/cli/install.sh | sh`.

`inth update` installs the latest release the way the CLI was installed: with the install script, or with a global npm, pnpm, bun, or Yarn installation. `inth update --check` reports whether a release is available. Interactive commands check npm at most once a day and print a notice when a newer release exists. Set `INTH_UPDATE_CHECK_DISABLED=1` or `NO_UPDATE_NOTIFIER=1` to turn the check off.
