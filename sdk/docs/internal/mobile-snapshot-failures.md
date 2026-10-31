---
title: Mobile snapshot failures
description: React Native permission behavior when a native consent snapshot is unreadable.
---

React Native denies every optional category when the current native snapshot
cannot be read. An earlier grant does not authorize processing while the current
permission answer is invalid. Necessary processing remains allowed.

The replacement snapshot has `ready: false`, `policyPending: true` and error code
`invalid-native-snapshot`. `useConsentDecision` reports `pending` for optional
categories so integrations can keep observing for recovery. Permission and status
subscribers receive the change. The last readable revision remains available for
diagnostics; it does not indicate that the previous grant is still valid.

Every known category in `effectivePermissions` must contain a boolean. A missing
or malformed permission makes the snapshot unreadable, even if another category
contains `true`. Additive native fields remain supported.

A later readable snapshot restores the native answer, including when its revision
matches the last readable revision. Repeated reads of unchanged payload bytes
reuse the same decoded object.

This behavior covers an unreadable native answer. A valid snapshot reporting a
transport failure follows the native engine's existing offline rules. JavaScript
does not erase durable consent or reconstruct policy decisions.

Client tests exercise the production snapshot reader and event subscriptions with
an injected native module. Physical-device and native lifecycle acceptance remain
separate release gates.
