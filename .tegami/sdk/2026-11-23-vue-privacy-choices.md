---
packages:
  "group:sdk": patch
---

### Vue and Nuxt: the consent banner and "Your Privacy Choices" dialog

The stock Vue and Nuxt `ConsentBanner` and `ConsentManager` render the same banner and dialog as React. Place the banner with `presentation.prompt.container` in the plugin's or Nuxt module's options, or with the `container` prop:

```ts
app.use(inth, {
  presentation: {
    prompt: { container: { type: "drawer", side: "start" } },
  },
});
```

- **Banner:** a Card, a slim Banner or a Drawer that follows your policy (EU choice, US opt-in, US notice; nothing under a US opt-out policy without a prompt). Customize opens the options in the banner. A `start` or `end` Drawer shows every option at once on desktop and becomes a bottom Drawer on phones. `blockUntilChoice` and a centred Card block the page until the visitor chooses, never under a US opt-out policy. After a choice, the result is announced and focus moves to your `PrivacyChoicesLink`, `ConsentDialogLink` or the floating dialog trigger.
- **Dialog:** "Your Privacy Choices" opens from `InthProvider` and from `<ConsentManager />`: the sale and sharing control, the receipt and Preferences in the US; the cookie categories, their vendors and Save choices in the EU. On phones, Preferences and vendor lists open as sheets over the dialog.

The page downloads only the stylesheet of the container it shows. The banner's options load when the visitor first opens them, or at once in a side Drawer, and the dialog loads when it opens.

The `components` parts work in Vue too: `banner.expand`, `banner.rightsRow`, `banner.saveButton`, and `dialog.footer`, `dialog.rightsRow`, `dialog.receipt`, `dialog.preferencesRow`, `dialog.categoryGroup`, `dialog.vendorTable`, `dialog.sheet`, `dialog.doneButton` and `dialog.saveButton`, with their theme slots. A part with `noStyle: true` drops its stock classes.
