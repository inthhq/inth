---
packages:
  "group:inth": patch
---

### Try c15t v3 setup with `inth c15t` (experimental)

Set `INTH_EXPERIMENTAL_C15T=1` to enable `inth c15t`, which sets up c15t v3 in the current app. Choose an Inth project or create one, then pick how to set up c15t: start a coding agent (Codex, Claude Code, Cursor, Grok, or fx) with the c15t setup prompt, add the c15t files to the app and install its packages, or print the prompt for another agent. `--codex`, `--claude`, `--cursor`, `--grok`, and `--fx` start that agent directly. `inth c15t scaffold` and `inth c15t prompt` support `--json` for scripts.

The command uses c15t v3 prereleases and stays hidden from help until v3 ships. Without the variable, `inth c15t` remains an unknown command.
