---
packages:
  "group:inth": minor
---

### Add CLI usage telemetry and error reporting

Production builds collect command usage and report unexpected errors to help improve the CLI. Reports exclude raw command arguments, credentials, request bodies, and arbitrary error messages. Development builds send no telemetry.

To opt out, run `inth telemetry disable` or set `INTH_TELEMETRY_DISABLED=1`. The same setting controls usage tracking and error reports.
