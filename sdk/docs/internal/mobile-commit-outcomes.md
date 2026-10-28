---
title: Mobile consent action outcomes
description: Handle refused native commits and durable offline success in mobile clients.
---

# Mobile consent action outcomes

Check `CommitResult.ok` after awaiting `save`, `acceptAll` or `rejectAll`.
A resolved promise can carry `ok: false`. That result means the native engine
refused the action. Keep the draft and offer a retry. `reason` identifies failures
such as `policy-pending`, `queue-write-failed` or `concurrent-change`.

`ok: true, queued: true` means the choice and its delivery obligation are durable
locally. The UI can close even when the network is unavailable. Remote delivery
is a separate outcome. `delivered` is optional because older native builds do not
include it; its absence does not prove backend acceptance.

The existing React Native dialog and preference center close and reset their
drafts only for `ok: true`. A refused action or rejected bridge call leaves them
open with the draft intact and shows an accessible retry message. The banner
also reports failures and leaves the choice available. The error clears when the
user retries. Action buttons prevent another commit while the current one is
pending.

The copy resolver accepts `common.saveError` from native translations, with
"Your choices could not be saved. Try again." as its fallback. This is a mobile
copy field. It does not change the backend's shared translation schema.

These fixes protect the existing preview UI while shared SwiftUI and Compose
presenters are implemented. They do not satisfy the native stock UI, IAB,
busy-JavaScript, device accessibility or lifecycle release gates. Tests exercise
the production client, hooks and components with an injected native module.
