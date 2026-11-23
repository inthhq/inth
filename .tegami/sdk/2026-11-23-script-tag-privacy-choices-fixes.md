---
packages:
  "group:sdk": patch
---

### Script tag and `init()`: banner and dialog fixes, and a "Your Privacy Choices" link

These changes bring the script tag's banner and dialog in line with the React fixes.

**Banner**

- An opt-in confirmation now opens and can be confirmed. Before, a pending opt-in could hang.
- The first layer shows only the actions your policy allows (reject, accept, customize), in the order and groups of `presentation.prompt.layout`. This applies to the Card, the Drawer and the collapsed bar. Its groups, such as `['customize', ['accept', 'reject']]`, keep their wrapper and the `consentBannerFooterSubGroup` slot in the collapsed bar too. A notice still shows its opt-out link and OK.
- The collapsed bar now takes the `consentBannerTitle`, `consentBannerDescription` and `consentBannerFooter` slots, like the card.
- The root sets `dir` from the banner's language, and `disableAnimation` sets `data-animation="off"` on it.
- When a side Drawer becomes all-in-one, an expansion opened on a phone is folded, so it does not open again when the viewport narrows.
- The rights wording reads the rights this browser's opt-out confirmed.

**Dialog**

- An opt-out confirmation (after a revocation reload, or from a one-click opt-out) opens the dialog with focus on the receipt.
- US or EU now follows the policy's model and US markers, not its prompt. An EU opt-in policy that shows no banner still gets the EU dialog.
- Phone sheets use the prompt's resolved phone edge style. A Card is always inset.
- A sheet reopened during its exit stays open. On desktop or under reduced motion a closing sheet leaves at once.
- Chevrons that point to a sheet mirror in right-to-left languages, and the dialog root sets `dir` from its language.
- When the element that opened the dialog is gone, focus returns to the "Your Privacy Choices" link, then to the floating trigger.
- `ui.dialog.disableAnimation` (or `ui.disableAnimation`) now stops the dialog's motion: the backdrop, the card and phone sheets show at once, and the root gets `data-animation="off"`.
- `ui.dialog.legalLinks` now applies to the dialog's footer link (the Cookie Policy in the EU, the Privacy Policy in the US): `null` hides it, and a list shows it only when its key is in the list.

**Both**

- A banner or dialog that fails to load is reported in the console and loads on the next try.
- Your `css` option comes after the surfaces' stylesheets, so your rules win, as documented.
- Scroll-edge fades stay after the banner or dialog updates.
- A side Drawer that becomes all-in-one when the viewport widens now shows its options.
- When focus returns after a choice or when the dialog closes, a "Your Privacy Choices" link or opener that cannot take focus (for example, inside a hidden footer) is skipped.
- The dialog's root takes the `consentDialog` slot and its `part`.
- A click on a category or vendor row inside the shadow root no longer toggles it while text is selected.
- `noStyle` now also removes the class names from the banner's legal links.
- The opt-out icon in `createPrivacyChoicesLink` has `width` and `height` attributes (14px tall) instead of a `style` attribute, which a strict Content Security Policy blocks. With `noStyle` it has no size.
- Timers and animation frames stop when the dialog is destroyed.

**New: `createPrivacyChoicesLink`**

`@inth/sdk` exports `createPrivacyChoicesLink(client, options?)`. It returns a button that opens the dialog, for your footer. Under an opt-out policy it is your opt-out link, with the California opt-out icon for the Privacy Choices titles. It is also the way back into the dialog under opt-in policies, in the US and the EU. There it reads "Your Privacy Choices", with no icon. The button is `hidden` when there is nothing to show.

```js
import { createPrivacyChoicesLink, init } from "@inth/sdk";

const inth = init({ projectUrl: "https://your-project.inth.app" });
const link = createPrivacyChoicesLink(inth);
document.querySelector("footer")?.append(link.element);
```
