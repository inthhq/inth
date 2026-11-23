---
packages:
  "group:sdk": patch
---

### Resolve the consent prompt as a Card, Banner or Drawer

`resolveLayout()` decides where the consent prompt sits and how it behaves. It takes a `container` (a Card at `start`, `end` or `center`; a Banner on the `bottom` or `top` edge; or a Drawer from the `bottom`, `top`, `start` or `end`), an `edgeStyle` (`inset` or `flush`) and `blockUntilChoice`. It returns the placement, whether the prompt expands in place or shows every choice at once, its edge style, and whether it blocks the page. `start` and `end` follow the page's writing direction, as CSS logical properties do: on a right-to-left page, `start` is the right side.

The rules are the same in every framework:

- A centred Card always blocks the page. Where the policy can't block, it falls back to the `start` corner.
- Only a choice prompt outside an opt-out model can block. A notice, a rule with no prompt and the US opt-out presets never block, even with `blockUntilChoice`.
- `start` and `end` Drawers show every choice at once on desktop. On phones (`PHONE_LAYOUT_QUERY`, 640px and narrower) they become a bottom Drawer.
- A Card is always inset.

`resolveConsentPresentation()` now returns `container.desktop` and `container.phone` for the prompt. When `container` isn't set, it maps the existing `variant` and `position`: `floating` and `widget` become a Card in the bottom corner on the same side (a `-right` position becomes `end`, anything else `start`; on a right-to-left page the Card therefore sits in the mirrored corner), `bar` becomes a Banner on the same edge, and `wall` becomes a centred Card. `blocking`, and the older `scrollLock` and `trapFocus`, map to `blockUntilChoice`.

The stock components don't read the new fields yet, so nothing on the page changes.
