---
packages:
  "group:inth": minor
---

### Let Inth's setup agent add c15t

`inth c15t --inth` adds c15t to your app without a coding agent or AI account of your own. On macOS and Linux, inth downloads a pinned, checksum-verified [fx](https://github.com/vercel-labs/fx) agent and runs it in your app directory, with model use paid by Inth within daily limits. It writes the backend URL to `.env`, installs packages, edits the app, and runs your checks, but cannot read secrets, edit outside the app, commit, push, or deploy. It ends with a report and the consent checks to do in a browser. When no coding agent is installed, the `inth c15t` picker now recommends it.

`inth login` now also asks to allow Inth's setup agent. Sign in again before your first `--inth` run if you signed in with an earlier version. Inth's setup agent is rolling out; until it reaches your organization, the command explains that it is not available yet.
