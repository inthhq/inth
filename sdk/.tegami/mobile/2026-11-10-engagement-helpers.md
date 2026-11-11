---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Connect Braze, Branch, Singular and Amplitude to native consent

`BrazeIntegration`, `BranchIntegration`, `SingularIntegration` and
`AmplitudeIntegration` join the platform helpers:

- Braze stays disabled until its category is granted, and records Google's
  DMA consent attributes on the user while it runs. Withdrawing the category
  disables Braze at once, so Braze keeps the last attributes it received; the
  Braze guide explains how to clear them.
- Branch sets its attribution level from marketing and measurement, and sends
  DMA parameters. Deep links keep working at every level.
- Singular is started by the helper on the first grant, because it ignores
  privacy calls before initialization. It then resumes, opts in and limits
  data sharing from marketing, and stops all tracking on withdrawal.
- Amplitude's opt-out follows measurement, matching the React Native helper.

Amplitude reads `optOut` on its own queue, so an event tracked at the moment
of withdrawal can still be processed under the old value.
