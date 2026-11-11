---
packages:
  'swift:c15t-swift': patch
  'maven:c15t-android': patch
---

### Keep observers firing until you end their handle, and type the consent host outcomes

Observers no longer stop because a callback was garbage-collected. The handle
each observer method returns now owns its callback, with no weak references
left in the core.

- Kotlin: `onChange` and `onError` hold the lambda until you call `close()` on
  the returned `Subscription`, as `gate` and `gateDecision` already did. An
  inline lambda keeps firing. Dropping the handle without `close()` keeps the
  callback alive, so close it when its owner goes away.
- Swift: `onChange` now takes a closure, `(ConsentSnapshot) -> Void`, instead
  of a `SnapshotObserver` object, and the protocol is gone. The core holds the
  closure until you call `cancel()` or release the `ConsentSubscription`.
  `onChange` and `gate` are no longer `@discardableResult`, so discarding the
  handle draws a warning. Capture an owner weakly inside the closure.
- Android: `ConsentHost.present(...)` returns a `ConsentHostSession`
  (`Presented`, `AlreadyPresented`, `NotRequired`) and reports a
  `ConsentHostOutcome` (`Committed`, `Acknowledged`, `Dismissed`,
  `Unavailable`) instead of JSON strings.
