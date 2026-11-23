---
packages:
  "group:sdk": patch
---

### Set the consent prompt's layout and blocking from a policy rule

A policy rule can now carry `surface`:

```ts
{
  ...policyRulePresets.europeOptIn(),
  surface: {
    container: { type: 'drawer', side: 'end' },
    edgeStyle: 'flush',
    blocking: 'required',
  },
}
```

- `container` takes the same values as `presentation.container`: a Card at `start`, `end` or `center`, a Banner at `bottom` or `top`, or a Drawer on `bottom`, `top`, `start` or `end`. `start` and `end` follow the page's writing direction, so on a right-to-left page a `start` Drawer opens on the right.
- `container` and `edgeStyle` are defaults. The script-tag and dashboard installs have no host presentation, so this is where they get a layout. A `container` or `edgeStyle` you set in `presentation`, in a component prop or in an experiment arm still wins.
- `blocking` is a rule, not a default. `forbidden` never blocks the page, even when the host asks for `blockUntilChoice` or a centred Card. `required` always blocks it, and works only on a `choice` prompt outside the `opt-out` model. `allowed`, the default, lets the host decide. A `choice` prompt under the `opt-out` model never blocks the page, as with `forbidden`. Where blocking is forbidden, a centred Card moves to the `start` corner, with a `blocking-forbidden` diagnostic, so no blocking card ever leaves the page usable behind it.
- The host's blocking request is read per layer: a component prop or experiment arm first, then `presentation.prompt`, each with `blockUntilChoice` ahead of `blocking`, `scrollLock` and `trapFocus`. So `blockUntilChoice: true` now blocks today's components too, and a provider's `blockUntilChoice: false` no longer wins over a component prop `blocking: true`. The resolved `container` and today's `blocking` read the same request.

Changing `surface` never asks a visitor again: it is not part of the policy, choice or notice fingerprints. A pack with a `surface` carries `fingerprints.presentation` instead, hashed from the canonical `surface`. The manifest's location check and the static banner compare it, so two policies that differ only in layout never share a banner. A resolution or manifest pack whose `surface` has no `fingerprints.presentation` is refused, and a `surface` that says nothing beyond what the rule implies, such as `{}` or `{ blocking: 'forbidden' }` on an opt-out rule, reads as no `surface`, in the static banner too.

`policyRulePresets.californiaOptOut()` and `policyRulePresets.usPrivacyStatesOptOut()` set `blocking: 'forbidden'`. They also take `{ prompt: 'notice' }` to show a dismissible notice instead of no banner, and `recommendedPolicyRules({ usOptOutPrompt: 'notice' })` does the same for both US rules in the recommended pack. The default is still no banner.

`ConsentContainer` and the other container types are now defined in `@inth/sdk/schema`. `@inth/sdk` exports them under the same names.

The stock components read `container`, so a policy's `container` places the Card, Banner or Drawer when the host sets none. Clients built before this release refuse a policy that carries `surface`, so send a rule with `surface` only to clients on this version or later. A rule without `surface`, and the US opt-out presets, reach older clients exactly as before.
