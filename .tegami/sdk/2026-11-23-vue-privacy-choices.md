---
packages:
  "group:sdk": patch
---

### Vue and Nuxt: the Privacy Choices banner and dialog with `design: 'privacy-choices'`

The stock Vue and Nuxt `ConsentBanner` and dialog can now render the Privacy Choices design, as React does. Your banner and dialog do not change until you opt in. Set it in the plugin's or Nuxt module's `presentation`:

```ts
app.use(inth, {
  presentation: {
    design: "privacy-choices",
    prompt: { container: { type: "drawer", side: "start" } },
  },
});
```

Setting `presentation.prompt.container`, or a policy surface with a container, also selects the new design. Set `design: 'classic'` to keep today's UI.

What you get, the same as in React:

- **Banner:** a Card, a slim Banner or a Drawer that follows your policy (EU choice, US opt-in, US notice; nothing under a US opt-out policy without a prompt). Customize opens the options in the banner. A `start` or `end` Drawer shows every option at once on desktop and becomes a bottom Drawer on phones. `blockUntilChoice` and a centred Card block the page until the visitor chooses, never under a US opt-out policy. After a choice, the result is announced and focus moves to your `ConsentDialogLink` or the floating dialog trigger.
- **Dialog:** "Your Privacy Choices" opens the new dialog from `InthProvider` and from `<ConsentManager />`: the sale and sharing control, the receipt and Preferences in the US; the cookie categories, their vendors and Save choices in the EU. On phones, Preferences and vendor lists open as sheets over the dialog.

The page downloads only the stylesheet of the container it shows. The banner's options load when the visitor first opens them, or at once in a side Drawer, and the dialog loads when it opens. A page on the classic design downloads none of it, and the classic dialog no longer loads on a page that uses the new design.

The new `components` parts work in Vue too: `banner.expand`, `banner.rightsRow`, `banner.saveButton`, and `dialog.footer`, `dialog.rightsRow`, `dialog.receipt`, `dialog.preferencesRow`, `dialog.categoryGroup`, `dialog.vendorTable`, `dialog.sheet`, `dialog.doneButton` and `dialog.saveButton`, with their theme slots. A part with `noStyle: true` drops its stock classes.

`@inth/sdk/surface-state` adds `resolveConsentDesign`, which tells you which design a presentation and policy render.
