---
packages:
  "group:sdk": patch
---

### React: try the Privacy Choices consent banner with `design: 'privacy-choices'`

The stock React `ConsentBanner` can now render the Privacy Choices design: a Card, a slim Banner or a Drawer, with the options opening in place instead of in the dialog. Your banner does not change until you opt in. Set it in the provider's `presentation`:

```tsx
<InthProvider
  options={{
    presentation: {
      design: "privacy-choices",
      prompt: { container: { type: "drawer", side: "start" } },
    },
  }}
>
  <ConsentBanner />
</InthProvider>
```

Setting `presentation.prompt.container` also selects the new design. Set `design: 'classic'` to keep today's banner while you configure a container. `resolveConsentPresentation` returns the result as `design`.

What the new banner does:

- It follows your policy. An EU choice shows Reject All, Accept All and Customize. A US opt-in policy asks in US terms: Don't allow, Allow and Choose. A US opt-out notice shows "Do not sell or share my data" and OK. A US opt-out policy without a prompt shows nothing.
- Customize opens the options in the banner: the cookie categories in the EU, and the "Selling, sharing and targeted ads" control and Preferences in the US. Opting back in asks for a confirmation. Esc folds the options back and never closes the banner.
- A `start` or `end` Drawer shows every option from the start on desktop, and becomes a bottom Drawer on phones (640px and narrower).
- With `blockUntilChoice`, or a centred Card, the page is blocked until the visitor chooses. It is never blocked under a US opt-out policy.
- After a choice, the result is announced to screen readers and focus moves to your "Your Privacy Choices" link.
- `start` and `end` follow the page's writing direction.

The page downloads only the stylesheet of the container it shows. The options' code and styles load when the visitor first opens them, or at once in a side Drawer. A page on the classic design downloads none of it.

New `components` parts for the new banner: `banner.expand` (the options), `banner.rightsRow` and `banner.saveButton`, with the theme slots `consentBannerExpand`, `consentBannerRightsRow` and `consentBannerSaveButton`. The other `banner.*` parts, `tag.banner`, the theme tokens and `noStyle` style the matching parts of the new banner.

`@inth/sdk/translations` adds English `privacyChoices` keys for the button labels and the rights control, such as `allow`, `dontAllow`, `saveChoices` and `confirmTitleOptIn`. New builders in `@inth/sdk/surface-state` fill them in: `resolvePrivacyChoicesVariant`, `resolvePrivacyChoicesBannerCopy` and `resolveSaleRightCopy`.

Vue, Svelte, Angular, Astro and the script tag keep the classic banner for now.
