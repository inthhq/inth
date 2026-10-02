---
packages:
  "group:inth": patch
---

### Explain why the credential store is unavailable

When the system credential store can't be reached, `--json` output now returns `credential_store_unavailable` instead of `command_failed`, including from `inth logout`. These failures are no longer sent to error reporting.

On Linux, the message now names the cause: libsecret is missing, the session bus can't be reached, or no Secret Service is running. Inside Codex's sandbox, which blocks the session bus, the CLI returns `sandbox_restricted` and says to run the command outside the sandbox, as it already does for Cursor.
