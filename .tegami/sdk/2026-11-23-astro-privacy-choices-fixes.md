---
packages:
  "group:sdk": patch
---

### Astro: Privacy Choices banner and dialog fixes, and a `<PrivacyChoicesLink />`

These fixes apply when your `presentation` uses `design: 'privacy-choices'`.

- **Opt-in confirmation:** with `ui: 'react'`, the dialog island hosts a pending opt-in's confirmation and adds the stylesheets it needs, so it no longer shows without its styles.
- **Opt-out confirmation:** when no `<OptOutConfirmation />` shows the confirmation, the dialog opens on the opt-out receipt, with focus on the receipt.
- **Allowed actions:** the collapsed Card, Banner and Drawer show only the actions your policy allows, in the order of your `presentation.prompt.layout`. Its groups, such as `['customize', ['accept', 'reject']]`, keep their wrapper and the `consentBannerFooterSubGroup` slot in the collapsed Banner too. A notice keeps its "Do not sell or share my data" link and OK.
- **Phone and desktop:** options you open on a phone are folded again when a wider screen shows the side Drawer, so they do not reopen when the screen narrows (PERM-13).
- **Rights:** the sale row names only the rights the server confirmed for this browser's opt-out.
- **Prompt root:** the root takes `dir` from the banner's language, carries `data-inth-surface="banner"`, and sets `data-animation="off"` when you turn off animation. Collapsed panels and a leaving prompt carry a real `inert` attribute.
- **Customization:** the collapsed bar reads the `consentBannerTitle`, `consentBannerDescription` and `consentBannerFooter` slots. The spacing of the US Preferences list is in the stylesheet, so `noStyle` removes it.
- **Dialog legal link:** with `ui: 'react'`, `<ConsentDialog legalLinks>` now reaches the Privacy Choices dialog's footer link (the Cookie Policy in the EU, the Privacy Policy in the US). Leave it out to show the link; `legalLinks={null}` hides it, and a list shows it only when its key is in the list.
- **Downloads:** a Privacy Choices page warms and opens only the Privacy Choices dialog. It never downloads the classic dialog's code or stylesheets. On a classic page, the React island now loads the classic dialog as its own chunk.

**New component:** `<PrivacyChoicesLink />` renders "Your Privacy Choices" in your footer, like React's `PrivacyChoicesLink`. It opens the preference dialog. With the Privacy Choices design, it shows under opt-in policies too, in the US and the EU, without the opt-out icon. Under an opt-out policy, it shows the opt-out link set by `presentation.optOutLink`, with the CCPA icon beside the Privacy Choices titles. After a choice, the banner moves focus to this link.

```astro
---
import { PrivacyChoicesLink } from '@inth/astro/components';
---
<footer><PrivacyChoicesLink /></footer>
```
