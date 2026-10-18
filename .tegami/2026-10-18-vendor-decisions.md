---
packages:
  "group:inth": minor
---

### Approve or ignore vendors

`inth vendors approve <vendor-id> --project <project-id>` accepts a vendor seen on a project and resolves its runtime Inbox finding. `inth vendors ignore` ignores the vendor and dismisses the finding. Both print the vendor's new state and the finding they closed.

`inth inbox get` now shows the vendor behind a runtime finding: its name, vendor ID, project ID, state, and what loaded it, such as a script URL or a Google Tag Manager container.

Browser sign-ins now request `vendors.write`. Run `inth login` again to approve vendors from an existing sign-in. Organization API keys cannot make vendor decisions.
