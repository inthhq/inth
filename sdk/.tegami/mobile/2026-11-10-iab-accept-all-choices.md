---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Read what Accept all saves before saving it

`ConsentCore.iabAcceptAllChoices()` on Swift and Android returns the TCF
selection Accept all saves on the current list: every live partner's bases
under the publisher's disclosure and restrictions, exactly as `save(.all)`
builds them. It returns `nil` (`null` on Android) whenever `openIABDraft()`
does, so a custom IAB screen can stage the same selection the stock Accept all
records.
