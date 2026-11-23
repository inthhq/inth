---
packages:
  "group:sdk": patch
---

### Script tag: the Privacy Choices design loads from `inth.choices.js`, and fixes

**A smaller engine for classic sites.** `inth.hosted.js` no longer carries the Privacy Choices design (`presentation.design: 'privacy-choices'`). It loads `inth.choices.js` from next to itself the first time that design applies, with the tag's nonce. A site on the classic design never downloads it. `inth.hosted.js` is about 124 KB smaller (about 32 KB gzipped). If you host the script files yourself, serve `inth.choices.js` next to `inth.hosted.js`, or set the `inth.js` tag's `data-choices-src` to its URL. `inth.testing.js` and `inth.iab.js` still carry the design in one file.

These changes apply when you set `presentation.design: 'privacy-choices'`:

- If the banner's code fails to load, the classic banner stays on screen, and the next update tries again. Before, the visitor could be left with no banner. A dialog that fails to load opens on the next try.
- Your `css` option comes after the design's stylesheets again, so your rules win, as documented.
- Scroll-edge fades stay after the banner or dialog updates.
- A side Drawer that becomes all-in-one when the viewport widens now shows its options.
- When focus returns after a choice or when the dialog closes, a "Your Privacy Choices" link or opener that cannot take focus (for example, inside a hidden footer) is skipped.
- The dialog's root takes the `consentDialog` slot and its `part`, like the classic dialog.
- A click on a category or vendor row inside the shadow root no longer toggles it while text is selected.
- `noStyle` now also removes the class names from the banner's legal links.
- If the design switches back to classic, for example in an experiment arm, the classic banner shows, and the Privacy Choices banner does not come back.
- The opt-out icon in `createPrivacyChoicesLink` has `width` and `height` attributes (14px tall) instead of a `style` attribute, which a strict Content Security Policy blocks. With `noStyle` it has no size.
- Timers and animation frames stop when the dialog is destroyed.
