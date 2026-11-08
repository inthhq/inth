---
packages:
  "group:inth": patch
---

### Send approved audit policies for the API to check

`inth website create` and `inth website update` now check only that `approvedAuditPolicy` is a JSON object or `null`, then send it unchanged. The Inth API checks the policy's fields and returns any error. Send back the policy you read from `inth website get`, or leave it out to keep the current one.
