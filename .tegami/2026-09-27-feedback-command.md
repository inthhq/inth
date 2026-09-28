---
packages:
  "group:inth": patch
---

### Send feedback from the CLI

Add `inth feedback` to report Inth failures, documentation mismatches, and feature requests. Supports structured flags, JSON bodies and output, and existing sign-ins and API keys. Only category and message are required. The API deduplicates identical reports from the same caller within a UTC day. Rate-limit errors return immediately without waiting or retrying.
