---
packages:
  'swift:c15t-swift': minor
  'maven:c15t-android': minor
---

### Build your own consent screens from headless blocks

SwiftUI and Jetpack Compose apps can now draw their own consent prompt,
preferences screen and IAB TCF screen without writing the consent logic. The
new blocks carry behaviour and no look:

- `ConsentGate` and `ConsentReady` show content for an allowed category, IAB
  vendor and purpose, or any check against the committed decision.
- `HeadlessConsentPrompt` calls your first layer only while a prompt is owed and
  gives it the copy plus accept all, reject all, acknowledge and open
  preferences.
- `HeadlessConsentPreferences` and `ConsentDraft` give category rows with a
  title, description, lock and switch binding, and a save that names the
  revision the draft was read at. A refused write keeps the edits for a retry.
  A save that another screen overtook marks the draft stale until it is reset.
- `ConsentDraft.iab` stages a TCF selection with the same commands as `useIAB()`
  on the web and lists purposes, special features, stacks, vendors with their
  bases after publisher restrictions, custom vendors and Additional Consent
  providers as rows.
- Copy comes from the generated translations as values you place. The blocks
  announce save results to the screen reader, name the surface, move focus on
  open, hold hardware Back on Android while a save runs, and lay paired actions
  out at equal width until large text needs them stacked.

The stock screens now run on the same draft and rows, so a custom screen and
the stock one record the same signals. On Android the blocks are in
`com.c15t.consentui.headless` in `c15t-consent-ui`. On iOS they are in
`C15tConsentUI`. Each SDK has a runnable custom example.

On iOS, `ConsentPresenter`'s `snapshot`, `pending`, `pendingAction`,
`showProgress`, `errorCode`, `failedAction`, `stale`, `categories`, `choices`
and `disclosure` are now computed from the draft, so their `$` publisher
projections, such as `presenter.$snapshot`, no longer exist. The values are
unchanged. Observe `presenter.objectWillChange` and read the property.
