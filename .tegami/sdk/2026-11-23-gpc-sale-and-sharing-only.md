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

The browser stores those categories on the opt-out record, so a policy that later maps fewer categories never lifts one the visitor already opted out of. An opt-out recorded before this release keeps switching off both `marketing` and `measurement`. It is never narrowed silently.

The change alters the US presets' policy, choice and notice fingerprints, so visitors on those presets are asked again where the rule prompts: a notice comes back, and under the opt-in variants every earlier grant needs a new choice. Consent receipts from SDK v2 no longer carry over on the California presets for the same reason.

An SDK older than this release cannot read an opt-out record that this release stores, and drops it. Don't run both on the same site.
