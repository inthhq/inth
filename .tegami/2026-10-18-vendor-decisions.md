---
packages:
  "group:inth": patch
---

### Review vendors seen on a project

`inth vendor list --project <project-id>` lists the vendors scans saw on a project, with their category, state, and vendor ID. `--state active` shows only vendors nobody has decided on yet. `inth vendor get <vendor-id> --project <project-id>` shows a vendor's hosts, when it was last seen, what loaded it, and its open Inbox finding. Both work with API keys.

`inth vendor approve <vendor-id> --project <project-id>` accepts a vendor seen on a project and resolves its runtime Inbox finding. `inth vendor ignore` ignores the vendor and dismisses the finding. Both print the vendor's name, its new state, and the finding they closed.

`inth inbox get` now shows the vendor behind a runtime finding: its name, vendor ID, project ID, state, and what loaded it, such as a script URL or a Google Tag Manager container.

Browser sign-ins now request `vendors.write`. Run `inth login` again to approve vendors from an existing sign-in. Organization API keys cannot make vendor decisions.
