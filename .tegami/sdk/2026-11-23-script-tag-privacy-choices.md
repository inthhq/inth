---
packages:
  "group:sdk": patch
---

### Script tag and `init()`: the Privacy Choices banner and dialog with `design: 'privacy-choices'`

The stock banner and dialog of the script tag and of `init()` from `@inth/sdk` can now render the Privacy Choices design, the same as React's. Your banner does not change until you opt in. Set it in `presentation`:

```js
import { init } from "@inth/sdk";

init({
  presentation: {
    design: "privacy-choices",
    prompt: { container: { type: "drawer", side: "start" } },
  },
});
```

Setting `presentation.prompt.container`, or a policy surface with a container, also selects the new design. Set `design: 'classic'` to keep today's banner.

What you get:

- **Banner:** a Card, a slim Banner or a Drawer. The options open in place: the cookie categories in the EU, and "Selling, sharing and targeted ads" and Preferences in the US. A `start` or `end` Drawer shows every option from the start on desktop and becomes a bottom Drawer on phones (640px and narrower). With `blockUntilChoice`, or a centred Card, the page is blocked until the visitor chooses. After a choice, the result is announced to screen readers and focus moves to your "Your Privacy Choices" link (`data-testid="privacy-choices-link"`) or the trigger.
- **Dialog:** "Your Privacy Choices" with the rights control, the receipt and Preferences in the US, and the categories with Reject all, Accept all and Save choices in the EU. On phones, Preferences and vendor lists open as sheets over the dialog.

The surfaces render in the stock UI's shadow root as before. Each one adds only its own stylesheet there: a Drawer page never carries the Card or Banner rules, and the options' and dialog's rules arrive when they first show. The `theme.slots` keys `consentBannerExpand`, `consentBannerRightsRow`, `consentBannerSaveButton`, `consentDialogSheet`, `consentDialogFooter`, `consentDialogDoneButton`, `consentDialogSaveButton`, `consentDialogPreferencesRow`, `consentDialogRightsRow`, `consentDialogReceipt`, `consentDialogCategoryGroup` and `consentDialogVendorTable` now style the new parts, and `noStyle` removes their styles.

With the npm package, each presentation, the options and the dialog load as separate chunks, and a page on the classic design loads none of them. `inth.hosted.js` carries them in the file. `inth.js` does not render this design before the engine: on such a page it loads the engine at once, which shows the banner.
