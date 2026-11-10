---
packages:
  '@c15t/react-native': minor
---

### Stage several choices in a draft and save them together

`useConsentDraft()` and `ConsentDraftProvider` bring the web preference
draft to React Native, so a custom preferences screen no longer needs the
stock native one. The draft starts from the subject's saved choices, stages
edits in JavaScript and records every displayed category in one commit when
you call `save()`. If the policy changes under an unsaved edit, the draft
turns stale and refuses to save until you call `reset()`.

`useSaveConsents()` now matches `@c15t/react`: called with no argument, the
function it returns saves the current draft. `'all'`, `'none'` and a
per-category object work as before.
