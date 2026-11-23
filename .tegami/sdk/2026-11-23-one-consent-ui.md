---
packages:
  "group:sdk": patch
---

### Breaking: one consent UI, placed by `container`

The stock banner and dialog now always render one consent UI in every framework and in the script tag: the banner in a Card, a Banner or a Drawer, with Customize opening the choices inside it, and the "Your Privacy Choices" dialog. The classic banner and preference dialog are gone, and so is the `design` option that used to choose between the two.

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
| `blocking` on `PromptPresentation` and the experiment arm's `prompt` | `blockUntilChoice`, the prompt's one blocking option. The IAB banner reads it too. `presentation.preferences.blocking` stays, for the IAB dialog. |
| `PromptVariant`, `PromptPosition`, `PROMPT_VARIANT_*`, `positionSource` | `ConsentContainer`, `ConsentPlacement` and the resolved `container` |
| `containerFromLegacyPrompt`, `LegacyPromptPresentation` | `container` |
| The `invalid-variant`, `invalid-position` and `legacy-presentation` diagnostics | The container's own diagnostics |
| `hideBranding` on `ConsentDialog` | Nothing: the dialog has no branding tag. |
| `@inth/sdk/ui/styles/privacy-choices.css` | Delete the import: `@inth/sdk/ui/styles.css`, or your framework's `styles.css` (such as `@inth/react/styles.css`), now holds every rule |
| `@inth/sdk/ui/styles/privacy-choices.tw3.css` (Tailwind CSS 3) | Delete the import: `@inth/sdk/ui/styles.tw3.css`, or your framework's `styles.tw3.css`, now holds every rule |
| `components.banner.actions` | `components.banner.footer` (`consentBannerFooter`) and `components.banner.actionGroup` (`consentBannerFooterSubGroup`) |
| `components.banner.rights`, the `consentBannerRights` theme slot | `components.banner.rightsRow` (`consentBannerRightsRow`) for the rights row Customize opens; the notice's opt-out link is `components.banner.rightLink` (`consentBannerRightLink`) |
| `components.description.manager` | `components.description.dialog` (`consentDialogDescription`), the dialog's intro |
| `components.tag.dialog`, the `consentDialogTag` theme slot | Nothing: the dialog has no branding tag. Both are accepted and style nothing. |
| `consentWidgetFooter` on the dialog's footer | `consentDialogFooter` (`components.dialog.footer`); `consentWidgetFooter` styles only `ConsentWidget` |

`container` is set on `ConsentBanner`, in `presentation.prompt.container`, or by the policy rule's `surface.container`, in that order. The policy rule's `surface.blocking` (`forbidden`, `allowed` or `required`) still constrains `blockUntilChoice` as before. A policy's `surface.container` now places the prompt on every site, with no `design` switch. `edgeStyle` (`inset` or `flush`) works the same way.

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
- The JavaScript theme's default dark `primaryTint` now mixes the dark primary (`#2f66df`) into the surface, as the stylesheet does with `var(--inth-primary)`, instead of the hover blue `#4f83f1`.

The classic banner and dialog CSS variables still apply: each part reads its own hook, then the classic variable, then the theme token. The stylesheets no longer declare the four variables that adapters read at runtime. Adapters that time an exit read `--consent-banner-animation-duration` and `--consent-dialog-animation-duration` and fall back to `--inth-duration-fast` and `--inth-duration-normal`. The backdrop reads `--inth-overlay` instead of `--consent-dialog-overlay-background-color` and its `-dark` twin. See "Classic variable compatibility" in the theme tokens docs.

**Stylesheets and bundles**

The per-surface sheets are renamed: `banner` is now `parts`, `bar` is `banner`, `dialog` is `widget`, and `privacy-choices-dialog` is `dialog`. The CSS modules `consent-bar` and `privacy-choices` are now `consent-banner` and `consent-dialog`. `styles.css` is the single full stylesheet.

The old import paths `@inth/sdk/ui/styles/components/consent-banner` and `consent-dialog` (with `.module.css`, `.css` or `.js`, and the same paths under `@inth/sdk-ui`) still resolve, but they now load different modules. They used to alias the classic banner's `prompt` and the classic dialog's `panel` class maps. They now load the Banner container's module and the consent dialog's module, whose class names are different, so code that reads classes from them gets `undefined`. Read the prompt shell from `consent-surface`, the containers from `consent-card`, `consent-banner` and `consent-drawer`, the options Customize opens from `consent-expand`, and the dialog from `consent-dialog`. Better still, target the parts through slots, `data-testid` or `data-*` attributes, which don't change between builds.

The banner's "Consent by" tag is now a neutral credit that reads `--consent-tag-background`, `--consent-tag-text-color`, `--consent-tag-border-color` and `--consent-tag-radius`. The `--consent-branding-tag-*` variables still style the tags on `ConsentWidget` and the IAB TCF banner and dialog, and no longer reach the banner's tag.

**React, Next.js and TanStack Start**

| Removed | Use instead |
| --- | --- |
| `managerMode`, `bannerPosition`, `ConsentBannerPosition`, `ConsentManagerMode` in the provider config | `presentation.prompt.container` |
| `ConsentBanner.Root`, `.Card`, `.PolicyActions`, `.AcceptButton` and the other compound parts, `useConsentBannerSurface` | Slots, theme tokens, or the headless hooks |
| `ConsentDialog.Root`, `.Card`, `.Overlay` and the other compound parts | Slots, theme tokens, or `ConsentWidget` in your own dialog |

**Vue and Nuxt**

`ConsentBanner` and `ConsentManager` render the consent banner and dialog, from `InthProvider` and when you mount them yourself.

| Removed | Use instead |
| --- | --- |
| `variant`, `position` and `blocking` props on `ConsentBanner` | `container`, `edgeStyle` and `blockUntilChoice` props |
| `ConsentDescription` (and `@inth/nuxt/components/consent-description`) | The banner's and dialog's own descriptions, styled through `components.description.banner` and `components.description.dialog` |
| The `PromptVariant` and `PromptPosition` types | `ConsentContainer`, `ConsentEdgeStyle`, `BannerEdge`, `CardPosition`, `DrawerSide` and `ResolvedConsentLayout`, now exported from `@inth/vue` |

`trapFocus` in the plugin or module options now applies only to the IAB banner and dialog, as in React. `<ConsentManager>` takes one prop, `disableAnimation`, and hosts the opt-in confirmation while it is mounted. A one-click opt-out opens it on its receipt, unless a standalone `<OptOutConfirmation />` is on the page, which now claims the confirmation as soon as it mounts.

**Svelte and SvelteKit**

- `ConsentBanner` takes `container`, `edgeStyle` and `blockUntilChoice`, and drops `variant`, `position`, `blocking`, `scrollLock`, `trapFocus` and `primaryButton`. Its `models` default to `['opt-in', 'opt-out']`.
- `ConsentDialog` drops `hideBranding` and `class`. Its `scrollLock` and `trapFocus` apply to the opt-in confirmation it hosts; the dialog itself always blocks.
- The provider's `scrollLock` and `trapFocus` now apply to the IAB banner and dialog and to the confirmations, not to the consent banner or dialog.
- `ConsentDialogPanel` from `@inth/svelte/dialog-panel` is the new dialog, without the trigger and confirmations `ConsentDialog` adds.
- `getHeadlessConsent()`'s `banner` and `dialog` carry the resolved `container` instead of `variant` and `position`.
- The banner's root no longer carries `data-prompt`, `data-model` or `data-position`; read `data-variant`, `data-placement`, `data-flow` and `data-edge-style`.

**Angular**

| Removed from `@inth/angular` | Use instead |
| --- | --- |
| `variant="floating"` on `<inth-consent-banner>` | `[container]="{ type: 'card', position: 'start' }"` (the default) or `'end'` |
| `variant="bar"`, `position="top"` / `"bottom"` | `[container]="{ type: 'banner', edge: 'top' }"` / `'bottom'` |
| `variant="widget"` | `[container]="{ type: 'card', position: 'end' }"` |
| `variant="wall"` | `[container]="{ type: 'card', position: 'center' }"`, which always blocks |
| `blocking`, `scrollLock`, `trapFocus` on `<inth-consent-banner>` | `blockUntilChoice` |
| `primaryButton` on `<inth-consent-banner>` | `layout` and the theme's `consentActions` |
| `rootClass` on `<inth-consent-banner>` and `<inth-consent-dialog>` | The `consentBanner` and `consentDialog` theme slots |
| `hideBranding` on `<inth-consent-dialog>` | Nothing: the dialog has no branding tag. `<inth-provider>` no longer passes it to the dialog. |
| `ng-template` `inthConsentBannerTitle`, `inthConsentBannerDescription`, `inthConsentBannerAction` (`ConsentBannerTitle`, `ConsentBannerDescription`, `ConsentBannerAction`, `BannerCopyContext`, `BannerActionContext`) and projected footer content | The `heading`, `description` and button text inputs, theme slots, or `HeadlessConsent` for your own markup |
| `BANNER_SHEETS` from `@inth/angular` | `PARTS_SHEETS` |
| `DIALOG_SHEETS` from `@inth/angular/consent-widget` | `WIDGET_SHEETS` |
| `variant`, `position`, `positionSource`, `scrollLock`, `trapFocus` and `design` on `HeadlessConsent.banner()` and `.dialog()` | `container` and `blocking`. Both signals now hold a `ResolvedConsentPresentation` plus `isVisible`. |
| `ConsentBannerHarness.getVariant()` / `getPosition()` | `getPlacement()`, which reads `data-placement` |
| `ConsentDialogHarness.getWidget()` | The dialog harness's own `getCategories()`, `isCategoryEnabled()`, `setCategory()` and `save()` |

Customize on `<inth-consent-banner>` now opens the choices inside the banner. Add `<inth-privacy-choices-link>` to your footer so visitors can reopen the dialog. The provider's `scrollLock` and `trapFocus` now apply only to the IAB surfaces and the opt-in and opt-out confirmations. `ConsentWidget`, `ConsentGate`, the IAB components, `<inth-consent-dialog-trigger>`, `[inthConsentDialogLink]` and the confirmations keep their inputs.

**Astro**

`<ConsentBanner />` always renders the consent prompt, placed by `presentation.prompt.container` or the policy's `surface.container`, and every dialog island (`ui: 'react'`, `'svelte'` or `'vue'`) renders the "Your Privacy Choices" dialog with its own stylesheets. The classic banner markup is gone.

| Removed | Use instead |
| --- | --- |
| `presentation.prompt.variant` / `position` / `blocking` in `inth()` | `presentation.prompt.container` / `blockUntilChoice` |
| `resolvePrivacyChoicesModel`, `privacyChoicesClassNames`, `renderPrivacyChoicesHTML`, `privacyChoicesFirstPaintSheets` from `@inth/astro/server` | `resolvePromptModel`, `promptClassNames`, `renderPromptHTML`, `promptFirstPaintSheets` |
| `privacyChoicesPresentation`, `usesPrivacyChoices` | `promptContainerType`; every page renders the prompt |
| The classic `resolvePromptModel`, `promptClassNames` and `PromptAction` | The prompt's model and class names above |
| `design` on the dialog adapter's mount and preload context | Nothing: there is one dialog |
| `data-variant` on the IAB banner root | Nothing: it floats at `data-position="bottom-left"`, as React's does |

A page that knows its policy inlines the tokens, the buttons, the prompt's shell and the one container it shows. A page that does not yet, such as a prerendered page in `hosted()` or `manifest()` mode, inlines `first-paint`, which now holds every container. The prompt's opt-out icon takes the `legal-links` sheet's `optOutIcon` class.

**Script tag and `@inth/sdk`**

- `ui.banner` takes `container`, `edgeStyle` and `blockUntilChoice`, which win over `presentation.prompt`. `ui.banner.scrollLock` and `ui.banner.trapFocus` now apply to the IAB banner only; use `blockUntilChoice` for the stock banner. `ui.dialog.hideBranding` applies to the IAB dialog only.
- `inth.js` no longer renders a banner of its own or records a choice before the engine. When a banner is due it loads `inth.hosted.js` at once and starts fetching `inth.choices.js` beside it; a choice made before the engine (a page action, or `inth.acceptAll()`) waits for the engine, which records it. `inth.js` is about 17 KB smaller gzipped (35.7 KB to 18.9 KB).
- `inth.dialog.js` and `inth.commit.js` are gone, with `data-dialog-src` and `data-commit-src`. `inth.choices.js` carries the banner in each container, its options and the dialog; `inth.hosted.js` loads it the first time the page shows one of them, so a returning visitor who sees no banner never downloads it. `inth.hosted.js` no longer carries the classic preference centre and is about 18 KB smaller gzipped (134.9 KB to 117.1 KB). If you host the files yourself, serve `inth.hosted.js`, `inth.records.js` and `inth.choices.js` next to `inth.js`, or set `data-hosted-src`, `data-records-src` and `data-choices-src`.
- `@inth/sdk/styles.css`, for `shadow: false` with `styles: false`, now holds the banner's and the dialog's rules too.
- The IAB banner stays in its bottom-left corner; `presentation.prompt.variant` and `position` no longer move it.
