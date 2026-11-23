---
packages:
  "group:sdk": patch
---

### Svelte and SvelteKit: the Privacy Choices banner and dialog with `design: 'privacy-choices'`

The stock Svelte `ConsentBanner` and `ConsentDialog` can now render the Privacy Choices design, as the React ones do: a Card, a slim Banner or a Drawer, with the options opening in place, and the "Your Privacy Choices" dialog. Your banner and dialog do not change until you opt in. Set it in the provider's `presentation`:

```svelte
<InthProvider
  options={{
    presentation: {
      design: "privacy-choices",
      prompt: { container: { type: "drawer", side: "start" } },
    },
  }}
>
  <ConsentBanner />
  <ConsentDialog />
</InthProvider>
```

Setting `presentation.prompt.container` also selects the new design. Set `design: 'classic'` to keep today's banner and dialog.

What changes with the new design:

- The banner follows your policy, as in React: an EU choice, a US opt-in request, a US opt-out notice, or nothing under a US opt-out policy without a prompt. Customize opens the options in the banner, and a `start` or `end` Drawer shows them from the start on desktop.
- `ConsentDialog` opens the "Your Privacy Choices" dialog: the "Selling, sharing and targeted ads" control, the receipt and Preferences in the US, and the cookie categories with Save in the EU. On phones (640px and narrower), Preferences and vendor lists open as sheets over the dialog.
- A server-rendered SvelteKit page renders the desktop container, and `inthHandle` writes only the stylesheets of the container it shows into the HTML.
- The page loads only the stylesheet of the container it shows. The options load when the visitor first opens them, or at once in a side Drawer, and the dialog loads when it opens. A page on the classic design loads none of them.
- After a choice, the result is announced to screen readers and focus moves to the element with `data-testid="privacy-choices-link"`, else to `data-testid="consent-dialog-trigger"`. The stock `PrivacyChoicesLink` carries the first; a link of your own can carry either.

The new parts take the same theme slots as in React: `consentBannerExpand`, `consentBannerRightsRow` and `consentBannerSaveButton` on the banner, and `consentDialogFooter`, `consentDialogRightsRow`, `consentDialogReceipt`, `consentDialogPreferencesRow`, `consentDialogCategoryGroup`, `consentDialogVendorTable`, `consentDialogSheet`, `consentDialogDoneButton` and `consentDialogSaveButton` on the dialog. The other banner and dialog slots, the theme tokens and `noStyle` style the matching parts of the new design.

`ConsentButton` takes three new optional props: `themeKey` styles it through another `theme.slots` key, `performDefaultAction={false}` leaves its click to your `onclick`, and `bind:ref` gives you the button element.
