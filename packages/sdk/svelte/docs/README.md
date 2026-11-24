# @inth/svelte

> Svelte and SvelteKit providers, request loading and static hosting with Inth.

These docs ship inside the package so coding agents can read them offline. Open the topic file you need from the list below — paths are relative to this file.

## Using these docs

These docs describe the Inth SDK (`@inth/*` packages). Find your app's row in Choose your setup, then follow that framework guide from start to finish; it names the files to create and the project URL to use. A visible banner does not prove anything: check that vendor requests wait for consent, that rejection survives a reload, and that preferences can be reopened.

## Start here

- [Svelte quickstart](./frameworks/svelte/quickstart.md)
- [SvelteKit quickstart](./frameworks/sveltekit/quickstart.md)
- [Choose your setup](./concepts/choose-your-setup.md): Pick the Inth SDK setup for your web framework, rendering mode or native mobile platform.
- [Performance](./performance.md): How Inth removes /v1/consent/init latency with build-time manifests, streams SSR consent without blocking paint, and defers UI and engine JavaScript.
- [How consent works](./concepts/how-consent-works.md): Learn how Inth evaluates policies, stored choices, and browser privacy signals on every page load to gate scripts and save consent.
- [Customize the interface](./customization/overview.md): Style Inth consent banners and dialogs with props, theme tokens, part classes, or headless hooks.
- [Verify consent](./guides/verify-consent.md): Verify in a production build that tracking scripts wait for consent, rejections persist across reloads, preferences reopen, and GPC applies.
- [Migrate from c15t](./migrate-from-c15t.md): Migrate a c15t or @c15t/* app to @inth/* packages, InthProvider, hooks, callbacks, and themes while keeping visitors' stored choices.

## More documentation

[Documentation index](https://inth.com/docs/llms.txt) · [Full Markdown context](https://inth.com/llms-full.txt). Prefer the index and individual pages for focused tasks.

## Frameworks

### Svelte

- [Callbacks](./frameworks/svelte/callbacks.md): Run your own code in a Svelte app when a visitor records a choice or permissions change, with onChoiceRecorded, onPermissionsChanged and script callbacks.
- [Clear on revocation](./frameworks/svelte/clear-on-revocation.md): Delete first-party cookies and Web Storage keys in a Svelte app when a consent category is revoked.
- [Components](./frameworks/svelte/components.md): Props and behavior of every @inth/svelte component in a Svelte app, from InthProvider and ConsentBanner to ConsentGate and DevTools.
- [ConsentBanner](./frameworks/svelte/components/consent-banner.md): Render the Inth cookie banner in a Svelte app with ConsentBanner, choosing a Card, Banner or Drawer container, blocking, layout, copy, and styles.
- [ConsentButton](./frameworks/svelte/components/consent-button.md): Accept, reject, save or open preferences from your own Svelte markup with ConsentButton, and what each action records.
- [ConsentDialog](./frameworks/svelte/components/consent-dialog.md): Add the Inth preference dialog to a Svelte app with ConsentDialog, covering lazy loading, props, keyboard behavior, and slots.
- [ConsentDialogLink](./frameworks/svelte/components/consent-dialog-link.md): Let visitors reopen Inth preferences from a Svelte footer with ConsentDialogLink, an unstyled button shown when required.
- [ConsentDialogTrigger](./frameworks/svelte/components/consent-dialog-trigger.md): Add a floating, draggable privacy button to a Svelte app with ConsentDialogTrigger and configure its position and size.
- [ConsentGate](./frameworks/svelte/components/consent-gate.md): Keep a YouTube video or map out of a Svelte page until its consent category is allowed with ConsentGate, and replace its placeholder.
- [ConsentWidget](./frameworks/svelte/components/consent-widget.md): Render Inth category switches inline on a Svelte privacy settings page with ConsentWidget, including draft and vendor controls.
- [DevTools](./frameworks/svelte/components/dev-tools.md): Inspect consent, scripts, location and events in a Svelte app with ConsentDevTools from @inth/svelte/devtools, loaded only in development.
- [IABConsentBanner](./frameworks/svelte/components/iab-consent-banner.md): Show the IAB TCF 2.4 first-layer banner to visitors under an IAB policy in a Svelte app with IABConsentBanner, its props and behavior.
- [IABConsentDialog](./frameworks/svelte/components/iab-consent-dialog.md): Show the IAB TCF 2.4 preference center with purposes, features and vendors in a Svelte app with IABConsentDialog.
- [InthProvider](./frameworks/svelte/components/inth-provider.md): Mount InthProvider at the root of a Svelte app to start Inth, with every prop, default, and update rule.
- [Primitives](./frameworks/svelte/components/primitives.md): Build an accessible consent dialog in Svelte with Dialog, Switch, Tabs, Accordion, and focus-management actions.
- [Content Security Policy](./frameworks/svelte/content-security-policy.md): Configure a Content Security Policy for a Svelte app using Inth, covering allowed hosts, nonces, and injected styles.
- [Customize](./frameworks/svelte/customize.md): Customize Inth colors, shape, button styles, and copy in a Svelte app with theme tokens, slots, and translations.
- [Embeds](./frameworks/svelte/embeds.md): Keep YouTube videos, maps and other iframes out of a Svelte page until their consent category is allowed, with ConsentGate or the iframe blocker.
- [Context getters](./frameworks/svelte/getters.md): Reference for @inth/svelte context getters in a Svelte app, covering permissions, recorded choices, drafts, IAB state, and events.
- [IAB GPP](./frameworks/svelte/gpp.md): Expose the IAB Global Privacy Platform API (__gpp) in a Svelte app so ad tech reads US state opt-outs and TCF consent.
- [Headless](./frameworks/svelte/headless.md): Replace the Inth banner or preference dialog with custom Svelte markup while keeping policy, storage, and script gating.
- [IAB TCF](./frameworks/svelte/iab.md): Turn on the IAB TCF 2.4 banner and preference center in a Svelte app with IABConsentBanner, IABConsentDialog and the provider's iab option.
- [Network blocker](./frameworks/svelte/network-blocker.md): Block fetch and XMLHttpRequest calls to tracking domains in a Svelte app until their consent category is allowed.
- [Quickstart](./frameworks/svelte/quickstart.md): Add a cookie consent banner to a Svelte 5 Vite app and hold back analytics until consent allows them.
- [Scripts](./frameworks/svelte/scripts.md): Load vendor scripts, iframes, and network requests in a Svelte app after consent is granted and stop them on revocation.
- [Translations](./frameworks/svelte/translations.md): Change Inth banner and dialog copy in a Svelte app with component text props or i18n, and switch languages at runtime.
- [Troubleshooting](./frameworks/svelte/troubleshooting.md): Fix Vite manifest fetch errors, missing banners, wrong project URLs, ignored theme colors, and early vendor loads in Svelte.
- [Vendor consent](./frameworks/svelte/vendor-consent.md): Let visitors allow a category in a Svelte app while turning off individual vendors with the vendors prop and getConsentManager.

### SvelteKit

- [Callbacks](./frameworks/sveltekit/callbacks.md): Run your own code in a SvelteKit app when a visitor records a choice or permissions change, with onChoiceRecorded, onPermissionsChanged and script callbacks.
- [Clear on revocation](./frameworks/sveltekit/clear-on-revocation.md): Delete first-party cookies and Web Storage keys in a SvelteKit app when a consent category is revoked.
- [Components](./frameworks/sveltekit/components.md): Props and behavior of every @inth/svelte component in a SvelteKit app, from InthProvider and ConsentBanner to ConsentGate and DevTools.
- [ConsentBanner](./frameworks/sveltekit/components/consent-banner.md): Render the Inth cookie banner in SvelteKit server HTML with ConsentBanner, choosing a Card, Banner or Drawer container, blocking, layout, and styles.
- [ConsentButton](./frameworks/sveltekit/components/consent-button.md): Accept, reject, save or open preferences from SvelteKit pages with ConsentButton, and what each action records.
- [ConsentDialog](./frameworks/sveltekit/components/consent-dialog.md): Add the Inth preference dialog to a SvelteKit root layout with ConsentDialog, covering lazy loading, props, and theme slots.
- [ConsentDialogLink](./frameworks/sveltekit/components/consent-dialog-link.md): Let visitors reopen Inth preferences from a SvelteKit footer with ConsentDialogLink, rendered in server HTML when required.
- [ConsentDialogTrigger](./frameworks/sveltekit/components/consent-dialog-trigger.md): Add a floating, draggable privacy button to a SvelteKit layout with ConsentDialogTrigger and configure its position and size.
- [ConsentGate](./frameworks/sveltekit/components/consent-gate.md): Keep a YouTube video or map out of SvelteKit server HTML until its consent category is allowed with ConsentGate, and replace its placeholder.
- [ConsentWidget](./frameworks/sveltekit/components/consent-widget.md): Render Inth category switches inline on a SvelteKit privacy settings route with ConsentWidget, including draft and vendor controls.
- [DevTools](./frameworks/sveltekit/components/dev-tools.md): Inspect consent, scripts, location and events in a SvelteKit app with ConsentDevTools, imported only when $app/env reports development.
- [IABConsentBanner](./frameworks/sveltekit/components/iab-consent-banner.md): Show the IAB TCF 2.4 first-layer banner to visitors under an IAB policy in a SvelteKit app with IABConsentBanner, its props and behavior.
- [IABConsentDialog](./frameworks/sveltekit/components/iab-consent-dialog.md): Show the IAB TCF 2.4 preference center with purposes, features and vendors in a SvelteKit app with IABConsentDialog.
- [InthProvider](./frameworks/sveltekit/components/inth-provider.md): Mount InthProvider in a SvelteKit root layout with loadConsent state so the banner renders in server HTML.
- [Primitives](./frameworks/sveltekit/components/primitives.md): Build an accessible consent dialog in SvelteKit with Dialog, Switch, Tabs, Accordion, and focus-management actions.
- [Content Security Policy](./frameworks/sveltekit/content-security-policy.md): Configure a Content Security Policy for a SvelteKit app using Inth, covering vendor hosts, inline styles, and nonces.
- [Customize](./frameworks/sveltekit/customize.md): Render Inth brand colors on the SvelteKit server with generateThemeCSS, and customize slots, button styles, and copy.
- [Embeds](./frameworks/sveltekit/embeds.md): Keep YouTube videos, maps and other iframes out of SvelteKit server HTML and the browser until their consent category is allowed.
- [Geography headers](./frameworks/sveltekit/geography-headers.md): Learn which request headers SvelteKit Inth helpers read for country, region, language, and Global Privacy Control.
- [Context getters](./frameworks/sveltekit/getters.md): Reference for @inth/svelte context getters in SvelteKit components, covering permissions, recorded choices, drafts, and IAB state.
- [IAB GPP](./frameworks/sveltekit/gpp.md): Expose the IAB Global Privacy Platform API (__gpp) in a SvelteKit app so ad tech reads US state opt-outs and TCF consent.
- [Headless](./frameworks/sveltekit/headless.md): Replace the Inth banner or preference dialog with custom markup in SvelteKit while keeping policy, storage, and script gating.
- [IAB TCF](./frameworks/sveltekit/iab.md): Turn on the IAB TCF 2.4 banner and preference center in a SvelteKit app with IABConsentBanner, IABConsentDialog and the provider's iab option.
- [Network blocker](./frameworks/sveltekit/network-blocker.md): Block browser fetch and XMLHttpRequest calls to tracking domains in a SvelteKit app until their consent category is allowed.
- [Quickstart](./frameworks/sveltekit/quickstart.md): Add a cookie consent banner to a SvelteKit app with server-side resolution and hold back analytics until consent allows them.
- [Rendering and deployment](./frameworks/sveltekit/rendering.md): Configure build-time manifests, runtime policy fetching, prerendered pages, static sites, and SPA mode in SvelteKit.
- [Scripts](./frameworks/sveltekit/scripts.md): Load vendor scripts, iframes, and network requests in a SvelteKit app after consent is granted and stop them on revocation.
- [Server API](./frameworks/sveltekit/server-api.md): Reference for inthHandle, loadConsent, createConsentRoute and resolveRequestConsent from @inth/svelte/kit and @inth/sdk/server, with every option and default.
- [Translations](./frameworks/sveltekit/translations.md): Change Inth banner and dialog copy in a SvelteKit app, where server-resolved consent carries translations for the visitor's language.
- [Troubleshooting](./frameworks/sveltekit/troubleshooting.md): Fix SvelteKit manifest fetch errors, missing server HTML banners, 405 save errors, wrong project URLs, and theme overrides.
- [Vendor consent](./frameworks/sveltekit/vendor-consent.md): Let visitors allow a category in a SvelteKit app while turning off individual vendors with InthProvider and getConsentManager.

## Concepts

- [Choose your setup](./concepts/choose-your-setup.md): Pick the Inth SDK setup for your web framework, rendering mode or native mobile platform.
- [Consent categories](./concepts/consent-categories.md): Map scripts, embeds, and network rules to Inth consent categories and control which categories appear in the preference dialog.
- [Consent state reference](./concepts/consent-state.md): Reference for Inth consent snapshots, save ordering, offline retries, storage sync across tabs, IAB TCF mapping, and server hydration.
- [Data fetching](./concepts/data-fetching.md): Choose how your app fetches Inth policies, reports sessions, links journey IDs, and proxies consent requests on your own origin.
- [How consent works](./concepts/how-consent-works.md): Learn how Inth evaluates policies, stored choices, and browser privacy signals on every page load to gate scripts and save consent.
- [Consent modes](./concepts/modes.md): Reference for projectUrl, manifest(), hosted(), and testing() modes, environment variables, bundle impact, and build-time manifest downloads.
- [Policies](./concepts/policies.md): Configure regional consent policies in Inth with opt-in, opt-out, IAB TCF, notice prompts, scope modes, and local testing overrides.
- [Performance](./performance.md): How Inth removes /v1/consent/init latency with build-time manifests, streams SSR consent without blocking paint, and defers UI and engine JavaScript.

## Guides

- [Banner experiments](./guides/banner-experiments.md): Run A/B tests on consent banner presentation with a feature flag or built-in assignment, and track impressions and choices per arm.
- [Cross-domain consent](./guides/cross-domain-consent.md): Sync signed-in users' consent across domains with @inth/node consents.check() and the userConsent provider option.
- [Troubleshooting](./guides/troubleshooting.md): Fix missing consent banners, scripts loading before consent, CORS errors, failed manifest builds, and missing projectUrl errors in Inth.
- [Verify consent](./guides/verify-consent.md): Verify in a production build that tracking scripts wait for consent, rejections persist across reloads, preferences reopen, and GPC applies.
- [Migrate from c15t](./migrate-from-c15t.md): Migrate a c15t or @c15t/* app to @inth/* packages, InthProvider, hooks, callbacks, and themes while keeping visitors' stored choices.

## Customization

- [Class names and CSS-in-JS](./customization/class-names.md): Style Inth consent components with CSS Modules, vanilla-extract, StyleX, Emotion, or plain classes in every supported framework.
- [Dark mode](./customization/dark-mode.md): Configure Inth dark mode with colorScheme, theme.dark tokens, .dark class tracking, and flash-free SSR rendering.
- [Motion and animation](./customization/motion.md): Customize Inth animation timing with motion tokens, turn animations off with disableAnimation, and animate on dialog data-state.
- [Customize the interface](./customization/overview.md): Style Inth consent banners and dialogs with props, theme tokens, part classes, or headless hooks.
- [Banner designs](./customization/recipes.md): Copy five tested Inth consent banner designs, from a single prop to headless markup, for React, Vue, Svelte, Astro, and HTML.
- [Component parts](./customization/slots.md): Reference every Inth banner, dialog, widget, trigger, and ConsentGate part key across frameworks, plus data state attributes and noStyle.
- [Stylesheets and CSS layers](./customization/stylesheets.md): Load Inth component styles automatically or manually, control CSS cascade layer order, defer dialog CSS, and disable default styles.
- [Tailwind CSS](./customization/tailwind.md): Use Inth consent styles with Tailwind CSS 4 or 3, apply utility classes to component parts, and sync Tailwind dark mode.
- [Theme tokens](./customization/tokens.md): Customize Inth colors, typography, radius, spacing, shadows, and motion with defineTheme(), ConsentTheme, and --inth-* CSS variables.
- [Copy and translations](./customization/translations.md): Translate Inth consent banners and dialogs across built-in languages, override copy in code, configure language detection, and support RTL layouts.

## Integrations

- [ActiveCampaign](./integrations/activecampaign.md): Load ActiveCampaign site tracking after marketing consent with the Inth activeCampaignTracking helper.
- [Ada](./integrations/ada.md): Load Ada Messaging after functionality consent and stop the widget on revocation with the Inth ada helper.
- [Adjust](./integrations/adjust.md): Gate the Adjust mobile SDK on Inth consent and send Google DMA third-party sharing in Swift, Kotlin, React Native, and Expo.
- [AdMob](./integrations/admob.md): Connect AdMob limited ads, personalization, and RDP to Inth marketing consent in Swift, Kotlin, React Native, and Expo.
- [Adobe Analytics](./integrations/adobe-analytics.md): Load an Adobe Data Collection Tags property for Adobe Analytics only after measurement consent with Inth.
- [Adobe Target](./integrations/adobe-target.md): Gate Adobe Target at.js or Adobe Experience Platform Web SDK on experience consent with Inth.
- [AdRoll](./integrations/adroll.md): Load the AdRoll pixel only after marketing consent with the Inth adrollPixel helper.
- [Ahrefs Analytics](./integrations/ahrefs-analytics.md): Load Ahrefs Web Analytics only after measurement consent with the Inth ahrefsAnalytics helper.
- [Amazon Ads](./integrations/amazon-ads.md): Load Amazon Ads and optional Amazon Consent Signal after marketing consent with Inth.
- [Amplitude](./integrations/amplitude.md): Gate Amplitude Browser SDK 2 on web consent or sync mobile Analytics opt-out with Inth in Swift, Kotlin, React Native, and Expo.
- [Appcues](./integrations/appcues.md): Load Appcues onboarding flows after experience consent and reset user state on revocation with Inth.
- [AppsFlyer](./integrations/appsflyer.md): Start and stop AppsFlyer on Inth consent and send Google DMA consent data in Swift, Kotlin, React Native, and Expo.
- [Attentive](./integrations/attentive.md): Load the Attentive tag only after marketing consent with the Inth attentiveTag helper.
- [Branch](./integrations/branch.md): Set Branch attribution levels and Google DMA parameters from Inth consent in Swift, Kotlin, React Native, and Expo while keeping deep links working.
- [Braze](./integrations/braze.md): Gate the Braze SDK on Inth consent and sync Google DMA consent attributes in Swift, Kotlin, React Native, and Expo.
- [Custom integrations](./integrations/building-integrations.md): Gate a vendor without an Inth helper, or sync consent with an SDK your app already loads.
- [Clay](./integrations/clay.md): Load Clay web intent only after marketing consent with the Inth clay helper.
- [Clearbit](./integrations/clearbit.md): Load the Clearbit enrichment tag only after marketing consent with the Inth clearbit helper.
- [Cloudflare Web Analytics](./integrations/cloudflare-web-analytics.md): Load the Cloudflare Web Analytics beacon only after measurement consent with the Inth cloudflareWebAnalytics helper.
- [Cloudflare Zaraz](./integrations/cloudflare-zaraz.md): Sync Inth consent categories to Cloudflare Zaraz purposes with the callback-only cloudflareZaraz bridge.
- [Crisp](./integrations/crisp.md): Load the Crisp chat widget only after functionality consent with the Inth crisp helper.
- [Customer.io](./integrations/customer-io.md): Load Customer.io Data Pipelines after marketing consent, configure proxies, and reset identity on withdrawal with Inth.
- [Databuddy](./integrations/databuddy.md): Load Databuddy and session replay after measurement consent, toggle tracking features, pin releases, and stop collection on withdrawal with Inth.
- [Default](./integrations/default-com.md): Gate the Default Pixel on measurement or the standalone Forms SDK on functionality with Inth.
- [Dynamic Yield](./integrations/dynamic-yield.md): Load Dynamic Yield scripts after experience consent, set page context, and sync Active Cookie Consent with Inth.
- [Expo Observe](./integrations/expo-observe.md): Gate Expo Observe telemetry dispatching on measurement consent in Expo apps with Inth.
- [Fathom Analytics](./integrations/fathom-analytics.md): Load Fathom Analytics only after measurement consent with the Inth fathomAnalytics helper.
- [Firebase Analytics](./integrations/firebase-analytics.md): Connect Firebase Analytics Consent Mode v2 signals to native Inth permissions in Swift, Kotlin, React Native, and Expo.
- [Front Chat](./integrations/front-chat.md): Load Front Chat after functionality consent, forward CSP nonces, and clear the chat session on withdrawal with Inth.
- [FullStory](./integrations/fullstory.md): Load FullStory after measurement consent, configure regional endpoints, and handle shutdown on withdrawal with Inth.
- [Gainsight PX](./integrations/gainsight-px.md): Gate Gainsight PX product analytics and in-app engagements on consent and disable tracking on withdrawal with Inth.
- [Google Maps](./integrations/google-maps.md): Gate Google Maps iframe embeds on consent with ConsentGate or data-category across all supported Inth frameworks.
- [Google Tag](./integrations/google-tag.md): Load gtag.js for Google Analytics or Google Ads with Inth Consent Mode v2 signals.
- [Google Tag Manager](./integrations/google-tag-manager.md): Load Google Tag Manager before or after consent with Inth Consent Mode v2 signals.
- [Gorgias Chat](./integrations/gorgias.md): Load Gorgias Chat after functionality consent and disable Segment tracking when measurement is denied with Inth.
- [Heap](./integrations/heap.md): Load Heap config and heap.js only after measurement consent with the Inth heap helper.
- [Hightouch](./integrations/hightouch.md): Load the Hightouch Events browser SDK only after measurement consent with the Inth hightouch helper.
- [Hotjar](./integrations/hotjar.md): Load Hotjar only after measurement consent with the Inth hotjar helper.
- [HubSpot](./integrations/hubspot.md): Load HubSpot after marketing consent, forward Inth categories, and gate chat on functionality consent.
- [Insider One](./integrations/insider.md): Load Insider One after marketing consent with user attributes, currency, and page context using Inth.
- [Intercom](./integrations/intercom.md): Load the Intercom Messenger only after functionality consent with the Inth intercom helper.
- [Klaviyo](./integrations/klaviyo.md): Gate Klaviyo signup forms and onsite tracking on marketing and measurement consent with Inth.
- [LinkedIn Insight Tag](./integrations/linkedin-insights.md): Load the LinkedIn Insight Tag only after marketing consent with the Inth linkedinInsights helper.
- [LiveIntent](./integrations/liveintent.md): Load LiveIntent LiveConnect only after marketing consent with the Inth liveIntentTag helper.
- [LogRocket](./integrations/logrocket.md): Load LogRocket session replay only after measurement consent with the Inth logRocket helper.
- [Lucky Orange](./integrations/lucky-orange.md): Load Lucky Orange after measurement consent and sync its privacy consent status with Inth.
- [Marketo Munchkin](./integrations/marketo.md): Load Adobe Marketo Munchkin only after marketing consent with the Inth marketoMunchkin helper.
- [Matomo Analytics](./integrations/matomo-analytics.md): Load Matomo after measurement consent or sync Matomo consent mode with the Inth matomoAnalytics helper.
- [Meta App Events](./integrations/meta-app-events.md): Sync Meta SDK automatic App Events, advertiser ID collection, and Limited Data Use with Inth consent in Swift, Kotlin, React Native, and Expo.
- [Meta Pixel](./integrations/meta-pixel.md): Load the Meta Pixel only after marketing consent with the Inth metaPixel helper.
- [Microsoft Clarity](./integrations/microsoft-clarity.md): Load Microsoft Clarity after measurement consent and send Consent V2 storage signals with the Inth clarity helper.
- [Microsoft UET](./integrations/microsoft-uet.md): Load Microsoft Advertising UET on every page and sync ad_storage consent mode signals with the Inth microsoftUet helper.
- [Mixpanel](./integrations/mixpanel-analytics.md): Connect Mixpanel tracking to Inth consent on the web, Swift, Android, React Native, and Expo.
- [OneDollarStats](./integrations/one-dollar-stats.md): Load the OneDollarStats tracker only after measurement consent with the Inth oneDollarStats helper.
- [OpenAI Pixel](./integrations/openai-pixel.md): Load the OpenAI ChatGPT Ads Measurement Pixel only after marketing consent with the Inth openaiPixel helper.
- [Optimizely](./integrations/optimizely.md): Gate Optimizely Web Experimentation and Personalization on experience consent with Inth.
- [Oracle Eloqua](./integrations/oracle-eloqua.md): Load Oracle Eloqua after marketing consent and coordinate opt-in and opt-out commands with Inth.
- [Integrations](./integrations/overview.md): Connect Inth to web and mobile analytics, tag managers, ad pixels, chat widgets and embeds.
- [Pendo](./integrations/pendo.md): Load and initialize Pendo only after measurement consent, with pause and resume support in Inth.
- [Pinterest Tag](./integrations/pinterest-tag.md): Load the Pinterest Tag after marketing consent and sync pintrk setconsent signals with Inth.
- [Pirsch](./integrations/pirsch.md): Load Pirsch Analytics after measurement consent while keeping custom event bindings working with Inth.
- [Plausible Analytics](./integrations/plausible-analytics.md): Load Plausible Analytics after measurement consent with Inth and configure modern or legacy snippets.
- [PostHog](./integrations/posthog.md): Gate PostHog analytics with Inth on web, Swift, Kotlin, React Native and Expo.
- [Promptwatch](./integrations/promptwatch.md): Load the Promptwatch attribution client after measurement consent with Inth.
- [RB2B](./integrations/rb2b.md): Load RB2B visitor identification after marketing consent with Inth, including SPA page-view guidance.
- [Reddit Pixel](./integrations/reddit-pixel.md): Load the Reddit Pixel after marketing consent and disable first-party cookies on withdrawal with Inth.
- [RudderStack](./integrations/rudderstack.md): Gate RudderStack on measurement consent or map Inth categories to destination consent IDs.
- [Rybbit Analytics](./integrations/rybbit-analytics.md): Load Rybbit Analytics, session replay, and Web Vitals after measurement consent with Inth.
- [Salesforce Account Engagement](./integrations/salesforce-pardot.md): Gate Salesforce Account Engagement tracking on marketing consent using the Tracking and Consent API or classic Pardot snippet with Inth.
- [Segment](./integrations/segment.md): Load Segment Analytics.js after measurement consent and guard track and identify calls with Inth.
- [Sentry](./integrations/sentry.md): Gate Sentry error monitoring, user data, and Session Replay on consent in web and mobile apps with Inth.
- [Shopify](./integrations/shopify.md): Sync Inth consent choices to Shopify's Customer Privacy API from a Hydrogen storefront.
- [Singular](./integrations/singular.md): Start Singular only after Inth consent allows it, then stop, resume, and limit data sharing in Swift, Android, React Native, and Expo.
- [Snapchat Pixel](./integrations/snapchat-pixel.md): Load the Snapchat Pixel only after marketing consent with the Inth snapchatPixel helper.
- [Statable](./integrations/statable-analytics.md): Load Statable analytics only after measurement consent with the Inth statableAnalytics helper.
- [The Trade Desk](./integrations/the-trade-desk.md): Load The Trade Desk Universal Pixel only after marketing consent with the Inth theTradeDeskPixel helper.
- [TikTok Pixel](./integrations/tiktok-pixel.md): Load the TikTok Pixel only after marketing consent with the Inth tiktokPixel helper.
- [Umami Analytics](./integrations/umami-analytics.md): Load the Umami Analytics tracker only after measurement consent with the Inth umamiAnalytics helper.
- [Vector](./integrations/vector.md): Load the Vector pixel only after marketing consent with the Inth vector helper.
- [Vercel Analytics](./integrations/vercel-analytics.md): Load Vercel Web Analytics only after measurement consent with the Inth vercelAnalytics helper.
- [Vercel Speed Insights](./integrations/vercel-speed-insights.md): Load Vercel Speed Insights after measurement consent and drop Web Vitals reports on revocation with Inth.
- [Wisepops](./integrations/wisepops.md): Load Wisepops popups, bars, embeds, and notification feeds only after marketing consent with Inth.
- [X Pixel](./integrations/x-pixel.md): Load the X Pixel only after marketing consent with the Inth xPixel helper.
- [YouTube](./integrations/youtube.md): Gate YouTube video embeds behind consent with Inth using ConsentGate or data-category across all supported web frameworks.
- [Zendesk Messaging](./integrations/zendesk.md): Load Zendesk Messaging after functionality consent, map measurement consent to its cookie ranges, and clear widget storage on revocation with Inth.
