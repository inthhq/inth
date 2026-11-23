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
- `container` and `edgeStyle` are defaults. The script-tag and dashboard installs have no host presentation, so this is where they get a layout. A `container`, `edgeStyle`, `variant` or `position` you set in `presentation`, in a component prop or in an experiment arm still wins.
- Each layer picks its container before the next one is read: its `container`, or else its legacy `variant` or `position`. So a component prop `variant: 'wall'` wins over a provider `container`.
- `blocking` is a rule, not a default. `forbidden` never blocks the page, even when the host asks for `blocking`, `blockUntilChoice`, a wall or a centred Card. `required` always blocks it, and works only on a `choice` prompt outside the `opt-out` model. `allowed`, the default, lets the host decide. The rule also sets the `blocking`, `scrollLock` and `trapFocus` values today's components read, so it applies to the banner you ship now. A `choice` prompt under the `opt-out` model never blocks the page, as with `forbidden`.

Changing `surface` never asks a visitor again: it is not part of the policy, choice or notice fingerprints. A pack with a `surface` carries `fingerprints.presentation` instead, hashed from the canonical `surface`. The manifest's location check and the static banner compare it, so two policies that differ only in layout never share a banner. A resolution or manifest pack whose `surface` has no `fingerprints.presentation` is refused, and `surface: {}` reads as no `surface`.

`policyRulePresets.californiaOptOut()` and `policyRulePresets.usPrivacyStatesOptOut()` set `blocking: 'forbidden'`. They also take `{ prompt: 'notice' }` to show a dismissible notice instead of no banner, and `recommendedPolicyRules({ usOptOutPrompt: 'notice' })` does the same for both US rules in the recommended pack. The default is still no banner.

`ConsentContainer` and the other container types are now defined in `@inth/sdk/schema`. `@inth/sdk` exports them under the same names.

The stock components don't read `container` yet; of `surface`, only `blocking` reaches them. Clients built before this release refuse a policy that carries `surface`, so send a rule with `surface` only to clients on this version or later. A rule without `surface`, and the US opt-out presets, reach older clients exactly as before.
