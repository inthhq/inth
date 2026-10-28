---
title: Mobile consent action outcomes
description: Handle refused native commits and durable offline success in mobile clients.
---

Check `CommitResult.ok` after awaiting `save`, `acceptAll` or `rejectAll`.
A resolved promise can carry `ok: false`. That result means the native engine
refused the action. Keep the draft and offer a retry. `reason` identifies failures
such as `policy-pending`, `queue-write-failed` or `concurrent-change`.

`ok: true, queued: true` means the choice and its delivery obligation are durable
locally. The UI can close even when the network is unavailable. Remote delivery
is a separate outcome. `queued` records enqueueing, so `queued: true` can coexist
with `delivered: true`. It does not identify a currently pending request.
`delivered` is optional and is absent from some native refusal shapes. iOS
currently reports `false`. Neither its absence nor `false` undoes local success
or proves backend rejection. Read delivery events for later outcomes.

The existing React Native dialog and preference center close and reset their
drafts only for `ok: true`. A refused action or rejected bridge call leaves them
open with the draft intact and shows an accessible retry message. The banner
also reports failures and leaves the choice available. The error clears when the
user retries. A different banner prompt kind, reason, policy or subject starts
with fresh action state. Each new presentation starts with fresh error and draft
state, even when it interrupts an exit animation. Action buttons prevent another commit
within that presentation while its current action is pending. A success from an
earlier presentation cannot reset or close a newly opened dialog or preference
center. If no new opening has started, a successful action still tells the host
to close after the content has finished hiding. Unmounting the surface cancels
its ability to reset or close a replacement surface. Native code still handles
commits pending across different presentations.
Keep host close handlers idempotent. If a user dismisses during a pending save,
its later success can request closing again when no newer presentation started.
Retry messages use one explicit accessibility announcement path on iOS and Android. VoiceOver
and TalkBack behavior still requires device validation.

The copy resolver accepts `common.saveError` from native translations, with
"Your choices could not be saved. Try again." as its fallback. This is a mobile
copy field. It does not change the backend's shared translation schema. Current
backend bundles omit this key, so every locale uses English until the native
bundle supplies a translation. Localized retry copy remains part of the
accessibility and documentation gates in ENG-520 and ENG-522.

These fixes protect the existing preview UI while shared SwiftUI and Compose
presenters are implemented. They do not satisfy the native stock UI, IAB,
busy-JavaScript, device accessibility or lifecycle release gates. Tests exercise
the production client, hooks and components with an injected native module.
