---
packages:
  "group:sdk": patch
---

### React, Next.js and TanStack Start: fixes to the consent banner and dialog

- **A category switched on after an opt-out now stays on.** When a visitor who opted out of sale and sharing turns a category such as Analytics back on in Your Privacy Choices, the switch said "Saved" and then turned itself off again. This happened when the opt-out came from `/v1/consent/init`, which sends it without its categories. A grant the visitor confirms after opting out now stands beside the opt-out. Marketing stays off, and the opt-out stays in place. This is a fix in `@inth/sdk`, so it applies to every framework.
- **Next.js and TanStack Start keep the server's banner.** In a deferred root, the banner now waits for the container it was server-rendered in before it hydrates. Before, React could replace the server's banner with a new one during hydration, which cost a second round trip.
- **Taps made before the page hydrates:**
  - The banner shows again if the consent engine fails to load after a tap. Before, it stayed hidden.
  - A tap on the notice's "Do not sell or share my data" link now expands the rights in place, as a tap after hydration does.
  - The banner root has `data-model` and `data-prompt` again. A tap is dropped if the policy the page resolves is a different one from the policy the visitor saw.
  - Allow, Don't allow and OK record the time of the tap, not the time the page hydrated.
- **Smaller dialog download.** The dialog chunk no longer includes the embedded `ConsentWidget` and its stylesheets.
- **`ConsentDialogLink right="opt-out"`** gives the California opt-out icon its own size, as `PrivacyChoicesLink` does. On a page whose stylesheet doesn't size the icon, it no longer fills the line.
- **Static banner (`consentManifest()` with `staticBanner`):**
  - `vite build` no longer fails in Node with `document is not defined`.
  - The page inlines only the stylesheets of the container the static banner shows. A client banner in another container, such as on a phone, loads its own stylesheets.
  - A side Drawer gets no static banner, because its options can't render until the app loads. Before, it showed an empty options panel.
- **Custom server rendering.** `preloadContainers()` and `preloadServerContainer()` from `@inth/react/components/consent-banner` are now public.
  - Await `preloadContainers()` before a synchronous `renderToString`. Otherwise a cold first request can render no banner.
  - Await `preloadServerContainer()` before you hydrate a page that you rendered on the server yourself.
  - Streaming renders, and the Next.js and TanStack Start adapters, need neither.
- **`scrollLock` and `trapFocus`** reach only these surfaces: the IAB banner and dialog, and the opt-out and opt-in confirmations. They never make the stock banner block. Use `presentation.prompt.blockUntilChoice` for that. The stock dialog always blocks and traps focus. The types now say this.
- **`disableAnimation`** now also stops the Protect and Allow check mark from animating, and the rest of the dialog's small transitions. The check shows already drawn, as it does under reduced motion.
