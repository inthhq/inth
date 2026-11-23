---
packages:
  "group:sdk": patch
---

### An opt-out your account holds no longer claims a Global Privacy Control signal

- With an opt-out held by the visitor's account and no Global Privacy Control signal, the sale row in the prompt and the dialog said "Your browser sent a Global Privacy Control signal". It now says "Your account has opted out, and you can change this after signing in."
- A signed-in visitor can press Allow and confirm, and the backend lifts the account's opt-out. Allow used to stay disabled for everyone, so there was no way back in from the UI.
- The row announces "allowed" only after the backend lifts the account's opt-out. If the backend refuses, it announces that the account still holds the opt-out.
- Allowing again over an opt-out and a stored refusal of marketing now leaves the control on Allow. It used to lift the opt-out and stay on "Opt out".
- New in `@inth/sdk/engine`: `confirmSaleRightThen(kernel, options, onAllowed)`, which the stock rows use.
- `resolveSaleRight().locked` is `false` for an account-held opt-out while a user is identified. `lock` still reads `'held-by-account'`.
