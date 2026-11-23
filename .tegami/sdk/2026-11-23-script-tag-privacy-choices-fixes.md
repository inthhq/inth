---
packages:
  "group:sdk": patch
---

### Script tag and `init()`: Privacy Choices fixes, and a "Your Privacy Choices" link

These changes apply when you set `presentation.design: 'privacy-choices'`. They bring the script tag in line with the React fixes.

**Banner**

- An opt-in confirmation now opens and can be confirmed. Before, a pending opt-in could hang.
- The first layer shows only the actions your policy allows (reject, accept, customize), in the order and groups of `presentation.prompt.layout`. This applies to the Card, the Drawer and the collapsed bar. A notice still shows its opt-out link and OK.
- The collapsed bar now takes the `consentBannerTitle`, `consentBannerDescription` and `consentBannerFooter` slots, like the card.
- The root sets `dir` from the banner's language, and `disableAnimation` sets `data-animation="off"` on it.
- When a side Drawer becomes all-in-one, an expansion opened on a phone is folded, so it does not open again when the viewport narrows.
- The rights wording reads the rights this browser's opt-out confirmed.

**Dialog**

- An opt-out confirmation (after a revocation reload, or from a one-click opt-out) opens the Privacy Choices dialog with focus on the receipt.
- US or EU now follows the policy's model and US markers, not its prompt. An EU opt-in policy that shows no banner still gets the EU dialog.
- Phone sheets use the prompt's resolved phone edge style. A Card is always inset.
- A sheet reopened during its exit stays open. On desktop or under reduced motion a closing sheet leaves at once.
- Chevrons that point to a sheet mirror in right-to-left languages, and the dialog root sets `dir` from its language.
- When the element that opened the dialog is gone, focus returns to the "Your Privacy Choices" link, then to the floating trigger.
- With the trigger on, a Privacy Choices page no longer downloads the classic preference centre.

**New: `createPrivacyChoicesLink`**

`@inth/sdk` exports `createPrivacyChoicesLink(client, options?)`. It returns a button that opens the dialog, for your footer. Under an opt-out policy it is your opt-out link, with the California opt-out icon for the Privacy Choices titles. With the Privacy Choices design it is also the way back into the dialog under opt-in policies, in the US and the EU. There it reads "Your Privacy Choices", with no icon. The button is `hidden` when there is nothing to show.

```js
import { createPrivacyChoicesLink, init } from "@inth/sdk";

const inth = init({ presentation: { design: "privacy-choices" } });
const link = createPrivacyChoicesLink(inth);
document.querySelector("footer")?.append(link.element);
```
