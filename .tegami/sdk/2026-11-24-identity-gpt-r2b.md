---
packages:
  "group:sdk": patch
---

### Signing out ends the account's pending opt-out answers

- `identify(undefined)`, and a provider's `user` going from an account to none, now sign the account out: `snapshot.user` becomes `null` at once, saves and opt-out requests stop carrying that account's identity, and IAB authority given under it is retired, as on `identify()`. The subject, its records and any held opt-out stay. Before, it did nothing, and an opt-out lift still out for the signed-out account could clear the opt-out once its answer arrived.
- An answer to a request made for one account never changes another account's state, or the signed-out state. This covers a queued account lift replayed while someone else is identified (also on a later page), a direct lift answered after a switch, a save's opt-out answer, and an `identify()` link answer that a newer `identify()` overtook: none of them changes the opt-out, the subject ID or the categories of whoever is identified now. The request still reaches the backend and is recorded there.
