---
packages:
  "group:sdk": patch
---

### Breaking: one consent UI, placed by `container`

The stock banner and dialog now always render the consent UI that `design: 'privacy-choices'` used to select: the banner in a Card, a Banner or a Drawer, with Customize opening the choices inside it, and the "Your Privacy Choices" dialog. The classic banner and preference dialog are gone, and so is the `design` option. React, Next.js, TanStack Start, Vue and Nuxt move first; Svelte, Angular, Astro and the script tag follow in the next release.

**What to change**

| Removed | Use instead |
| --- | --- |
| `presentation.design`, `ConsentDesign`, `resolveConsentDesign` | Nothing: there is one design. |
| `variant="floating"` | `container={{ type: 'card', position: 'start' }}` (the default) or `'end'` |
| `variant="bar"`, `position="top"` / `"bottom"` | `container={{ type: 'banner', edge: 'top' }}` / `'bottom'` |
| `variant="widget"` | `container={{ type: 'card', position: 'end' }}` |
| `variant="wall"` | `container={{ type: 'card', position: 'center' }}`, which always blocks |
| `blocking`, `scrollLock`, `trapFocus` on `ConsentBanner` | `blockUntilChoice` |
| `primaryButton`, `direction` on `ConsentBanner` | `layout` and the theme's `consentActions` |
| `presentation.prompt.variant` / `position` / `blocking` | `presentation.prompt.container` / `blockUntilChoice` |
| `PromptVariant`, `PromptPosition`, `PROMPT_VARIANT_*`, `positionSource` | `ConsentContainer`, `ConsentPlacement` and the resolved `container` |
| `containerFromLegacyPrompt`, `LegacyPromptPresentation` | `container` |
| The `invalid-variant`, `invalid-position` and `legacy-presentation` diagnostics | The container's own diagnostics |
| `managerMode`, `bannerPosition`, `ConsentBannerPosition`, `ConsentManagerMode` in the provider config | `presentation.prompt.container` |
| `ConsentBanner.Root`, `.Card`, `.PolicyActions`, `.AcceptButton` and the other compound parts, `useConsentBannerSurface` | Slots, theme tokens, or the headless hooks |
| `ConsentDialog.Root`, `.Card`, `.Overlay` and the other compound parts | Slots, theme tokens, or `ConsentWidget` in your own dialog |
| `hideBranding` on `ConsentDialog` | Nothing: the dialog has no branding tag. |
| `@inth/sdk/styles/privacy-choices.css` | `styles.css`, which now holds every rule |

`container` is set on `ConsentBanner`, in `presentation.prompt.container`, or by the policy rule's `surface.container`, in that order. A policy's `surface.container` now places the prompt on every site, with no `design` switch. `edgeStyle` (`inset` or `flush`) works the same way.

**What visitors see**

- Customize opens the choices inside the banner, with Save. It no longer opens the dialog. The dialog opens from `PrivacyChoicesLink`, `ConsentDialogLink`, `ConsentDialogTrigger`, a `ConsentGate` button, or your own code.
- `PrivacyChoicesLink` shows under opt-in policies too, as "Your Privacy Choices", so visitors always have a way back to the dialog.
- The dialog's Save stays disabled until a switch changes. Under an opt-out notice, the dialog shows the sale-and-sharing row, the receipt, Preferences, and Done.
- A blocking banner puts `role="dialog"` and `aria-modal` on the shell around the card, not on the card.
- A tap on the server-rendered banner before hydration is replayed by the banner once the engine loads, instead of being saved before it.

**Visual changes**

- The default primary color is `#2563eb` in light mode (hover `#1d4ed8`) and `#2f66df` in dark mode (hover `#4f83f1`). Dark-mode primary text is `#8ab4ff`.
- `radius.lg` is `16px` (`1rem`) and `radius.md` is `10px` (`0.625rem`).
- Switches read `--inth-switch-track-off` for the off track.

The classic banner and dialog CSS variables still apply: each part reads its own hook, then the classic variable, then the theme token. The stylesheets no longer declare the four variables that adapters read at runtime. Adapters that time an exit read `--consent-banner-animation-duration` and `--consent-dialog-animation-duration` and fall back to `--inth-duration-fast` and `--inth-duration-normal`. The backdrop reads `--inth-overlay` instead of `--consent-dialog-overlay-background-color` and its `-dark` twin. See "Classic variable compatibility" in the theme tokens docs.

**Stylesheets and bundles**

The per-surface sheets are renamed: `banner` is now `parts`, `bar` is `banner`, `dialog` is `widget`, and `privacy-choices-dialog` is `dialog`. The CSS modules `consent-bar` and `privacy-choices` are now `consent-banner` and `consent-dialog`. `styles.css` is the single full stylesheet.

**Vue and Nuxt**

`ConsentBanner` and `ConsentManager` render the new banner and dialog, from `InthProvider` and when you mount them yourself.

| Removed | Use instead |
| --- | --- |
| `variant`, `position` and `blocking` props on `ConsentBanner` | `container`, `edgeStyle` and `blockUntilChoice` props |
| `ConsentDescription` (and `@inth/nuxt/components/consent-description`) | The banner's and dialog's own descriptions, styled through `components.description.banner` and `components.description.dialog` |
| `components.banner.actions`, `components.banner.rights`, `components.description.manager` | `components.banner.footer`, `components.banner.actionGroup`, `components.banner.rightLink` |
| The `PromptVariant` and `PromptPosition` types | `ConsentContainer`, `ConsentEdgeStyle`, `BannerEdge`, `CardPosition`, `DrawerSide` and `ResolvedConsentLayout`, now exported from `@inth/vue` |

`trapFocus` in the plugin or module options now applies only to the IAB banner and dialog, as in React. `<ConsentManager>` takes one prop, `disableAnimation`, and hosts the opt-in confirmation while it is mounted. A one-click opt-out opens it on its receipt, unless a standalone `<OptOutConfirmation />` is on the page, which now claims the confirmation as soon as it mounts.
