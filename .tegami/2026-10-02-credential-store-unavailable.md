---
packages:
  "group:inth": patch
---

### Report an unavailable credential store with its own error code

When the system credential store can't be reached, for example on Linux without a Secret Service session, `--json` output now returns `credential_store_unavailable` instead of `command_failed`. `inth logout` returns the same code. These failures are no longer sent to error reporting.
