---
packages:
  "group:sdk": minor
---

### Return the full `UserConsent` document from `@inth/node` `consents.check()`

`consents.check()` now returns `{ categories, optOut, sync }` as `UserConsent` instead of only the category map. Read category decisions from `data.categories`.
