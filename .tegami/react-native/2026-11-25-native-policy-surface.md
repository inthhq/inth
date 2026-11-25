---
packages:
  "@inth/react-native": patch
---

### React Native: the native cores read a policy's `surface`

A policy rule can carry `surface: { container?, edgeStyle?, blocking? }`, which the web SDKs use to place the consent prompt. The Swift core used to refuse a policy that carried it, as a contract it did not know, and fell back to deny-all with the policy pending. The Kotlin core ignored it. Both now read it the way the web does:

- An unknown container type, position, edge, side, edge style or blocking constraint, or an unknown field, is `unsupported-contract`. A value of the wrong type, `blocking: 'required'` on a rule that cannot block, or a surface without `fingerprints.presentation` is `invalid-payload`. Either fails closed like any unreadable policy.
- The surface is kept in canonical form: the default position, edge or side is filled in, a card's edge style is dropped, a blocking constraint the rule already implies is dropped, and an empty surface is no surface.

The snapshot's `resolution` has two new optional fields. `surface` is the canonical surface. `layout` is the phone layout it resolves to with no host presentation: `type`, `placement`, `flow`, `blocking` and `edgeStyle`, as `resolveLayout` in the web SDK answers them. Both are absent under a rule without a surface, so that snapshot does not change.

The native consent screens do not use the layout yet. Their first layer is always a modal screen chosen by the theme's `firstLayer`, so a rule that forbids blocking still gets a modal first layer. Read `resolution.layout` if you present your own UI.
