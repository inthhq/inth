---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Show live consent state in Compose and SwiftUI without observer code

Both SDKs now publish consent state on the main thread, so a screen can show it
without wrapping the callback API first.

- Android: `c15t-android` adds `core.snapshotFlow`, a `StateFlow` of the
  snapshot, and `core.decisionFlow(category)`, a `StateFlow` that emits when that
  category's decision changes. Compose reads either with `collectAsState()`.
  `awaitSave`, `awaitRefresh` and `awaitFlushPending` are suspend versions of
  `save`, `refresh` and `flushPending`. `c15t-android` now declares
  kotlinx-coroutines 1.10.2 as an API dependency; it already reached apps through
  androidx.lifecycle. `c15t-core` stays free of coroutines.
- Kotlin core: `ConsentCore.refresh(onComplete)` calls back once the policy
  request has landed.
- Swift: `C15tCore` adds `PublishedConsent`, an `ObservableObject` for iOS 16.4
  and later, and `ObservableConsent`, an `@Observable` model for iOS 17 and later.
  Both publish the snapshot and a decision per category on the main actor.
  `PublishedConsent.decisionPublisher(for:)` serves UIKit through Combine.

The Swift quickstart's `ConsentModel` now holds a `PublishedConsent` instead of
observing the core itself.
