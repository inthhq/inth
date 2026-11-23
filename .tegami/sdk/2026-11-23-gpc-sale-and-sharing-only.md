---
packages:
  "group:sdk": patch
---

### Global Privacy Control no longer switches off analytics in the US presets

> **This changes legal behaviour and needs counsel's sign-off before it ships.** Under the US presets, a Global Privacy Control signal or a "Do not sell or share" opt-out no longer switches off `measurement`.

GPC is an opt-out of sale, sharing and targeted advertising. It says nothing about analytics. The US presets (`californiaOptIn`, `californiaOptOut`, `usPrivacyStatesOptIn`, `usPrivacyStatesOptOut` and the recommended pack) now map GPC to `marketing` only: `privacySignals: { gpc: { denyCategories: ['marketing'] } }`. If your measurement vendors sell or share data, add `measurement` back to the rule:

```ts
{
  ...policyRulePresets.californiaOptOut(),
  privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
}
```

The same list now decides what any opt-out under the rule switches off, whether GPC or the visitor recorded it. A rule that maps no GPC categories still switches off `marketing` and `measurement`.

If your own rule already set `privacySignals: { gpc: { denyCategories: ['marketing'] } }`, its meaning widens: before, the list applied to the GPC signal alone, and a "Do not sell or share" opt-out the visitor made themselves still switched off `measurement` too. Now that opt-out switches off `marketing` only. Add `measurement` to the list to keep the old result.

The browser stores those categories with the opt-out record, so a policy that later maps fewer categories never lifts one the visitor already opted out of. An opt-out recorded before this release keeps switching off both `marketing` and `measurement`. It is never narrowed silently.

The change alters the US presets' policy, choice and notice fingerprints, so visitors on those presets are asked again where the rule prompts: a notice comes back, and under the opt-in variants every earlier grant needs a new choice. Consent receipts from SDK v2 no longer carry over on the California presets for the same reason.

The categories go in a cookie and localStorage entry of their own, `<storageKey>-opt-out-categories`, beside the opt-out record, which keeps its old form. An older SDK on the same site, or a rollback, still reads the opt-out and keeps switching off `marketing` and `measurement`. If you list your cookies for a cookie banner or a scanner, add the new one; `clear()` removes it with the rest.

An opt-out the account holds, or one the backend sends for another act, never makes the browser switch off less than it did: the browser joins its categories with the ones it already held.

The same holds between the browser's own copies. When the cookie and localStorage hold opt-outs from different times, the newer one is the visitor's opt-out, but it switches off every category either copy did. A record the backend says this device holds counts as the browser's own act only when it has the same time and method.

When the backend confirms the opt-out this browser recorded, the browser now marks its rights as confirmed even though the backend's copy carries no categories. A newer opt-out adopted from the account, when the page loads or when `identify()` returns it, no longer shows this browser's opt-out reference or says it was recorded here.

When localStorage holds a wider list of categories for the same opt-out the server-rendered page started with, the browser takes the wider list and still keeps the opt-out's reference and its GPC mark.
