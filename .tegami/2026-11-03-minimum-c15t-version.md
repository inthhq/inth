---
packages:
  "group:inth": patch
---

### Set a project's minimum c15t version

`inth consent config-update --project <project-id> --minimum-c15t-major 3` makes the project refuse requests from c15t 2.x sites. Those sites stop loading the banner until they update to 3.x, so check `c15tV2HoursLast7Days` in `inth consent config-get` first. `--minimum-c15t-major 2` serves 2.x and 3.x again. Choosing 3 is rolling out and the command returns the server's refusal until it reaches your organization.
