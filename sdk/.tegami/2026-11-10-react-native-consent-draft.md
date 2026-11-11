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
turns stale and refuses to save until you call `reset()`. If another screen
records a different decision for a category the subject staged, that category
shows the new decision and is listed in `staleCategories`, and the draft
refuses to save until the subject sets it again or you call `reset()`. Native
refuses a draft save built on an older snapshot revision, so a decision recorded
while the save is in flight is never overwritten; `getBootstrap()` reports this
as `commitRevision`.

`useSaveConsents()` now matches `@c15t/react`: called with no argument, the
function it returns saves the current draft. `'all'`, `'none'` and a
per-category object work as before.
