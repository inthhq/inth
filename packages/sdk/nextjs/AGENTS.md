# @inth/nextjs

> Next.js App Router, Pages Router, static export and hydration with Inth.

These docs ship inside the package so coding agents can read them offline. Open the topic file you need from the list below — paths are relative to this file.

## Using these docs

These docs describe the Inth SDK (`@inth/*` packages). Find your app's row in Choose your setup, then follow that framework guide from start to finish; it names the files to create and the project URL to use. A visible banner does not prove anything: check that vendor requests wait for consent, that rejection survives a reload, and that preferences can be reopened.

## Start here

- [Next.js quickstart](./docs/frameworks/next/quickstart.md)
- [App Router setup](./docs/frameworks/next/app-router.md)
- [Pages Router setup](./docs/frameworks/next/pages-router.md)
- [Static export setup](./docs/frameworks/next/static-export.md)
- [Choose your setup](./docs/concepts/choose-your-setup.md): Pick the Inth SDK setup for your web framework, rendering mode or native mobile platform.
- [Performance](./docs/performance.md): How Inth removes /v1/consent/init latency with build-time manifests, streams SSR consent without blocking paint, and defers UI and engine JavaScript.
- [How consent works](./docs/concepts/how-consent-works.md): Learn how Inth evaluates policies, stored choices, and browser privacy signals on every page load to gate scripts and save consent.
- [Customize the interface](./docs/customization/overview.md): Style Inth consent banners and dialogs with props, theme tokens, part classes, compound components, or headless hooks.
- [Verify consent](./docs/guides/verify-consent.md): Verify in a production build that tracking scripts wait for consent, rejections persist across reloads, preferences reopen, and GPC applies.
- [Migrate from c15t](./docs/migrate-from-c15t.md): Migrate a c15t or @c15t/* app to @inth/* packages, InthProvider, hooks, callbacks, and themes while keeping visitors' stored choices.

## More documentation

[Documentation index](https://inth.com/docs/llms.txt) · [Full Markdown context](https://inth.com/llms-full.txt). Prefer the index and individual pages for focused tasks.

## Frameworks

- [App Router](./docs/frameworks/next/app-router.md): Set up Inth in the Next.js App Router with a build-time policy manifest, consent-gated scripts and a streamed or awaited layout.
- [Callbacks](./docs/frameworks/next/callbacks.md): Run callbacks in a Next.js app when visitors record consent, permissions change, requests fail or before revocation reloads.
- [Clear on revocation](./docs/frameworks/next/clear-on-revocation.md): Delete first-party cookies and Web Storage keys in Next.js when a consent category is denied using clearOnRevocation.
- [Client-side initialization](./docs/frameworks/next/client-side.md): Initialize Inth in the browser in Next.js using hosted() mode, without server prefetch or consent API routes.
- [Components](./docs/frameworks/next/components.md): Reference for every Inth component exported by @inth/nextjs, whether it runs on the client or server, and where to mount it.
- [ConsentBanner](./docs/frameworks/next/components/consent-banner.md): Render ConsentBanner inside a Next.js InthProvider and configure variants, per-policy button layouts, compound parts and data attributes.
- [ConsentDialog](./docs/frameworks/next/components/consent-dialog.md): Mount ConsentDialog inside a Next.js InthProvider to open the modal preference center from banners, links and triggers.
- [ConsentDialogLink](./docs/frameworks/next/components/consent-dialog-link.md): Reopen the preference center from a Next.js footer with ConsentDialogLink inside InthProvider.
- [ConsentDialogTrigger](./docs/frameworks/next/components/consent-dialog-trigger.md): Add a floating ConsentDialogTrigger button or multi-action toolbar to a Next.js InthProvider to reopen preferences.
- [ConsentGate](./docs/frameworks/next/components/consent-gate.md): Gate iframes and third-party widgets behind consent in Next.js with ConsentGate inside InthProvider.
- [ConsentWidget](./docs/frameworks/next/components/consent-widget.md): Render ConsentWidget as an inline preference center on a Next.js privacy page inside InthProvider.
- [DevTools](./docs/frameworks/next/components/dev-tools.md): Load the Inth DevTools panel only in Next.js development builds to inspect consent state, scripts, policies and events.
- [InthProvider](./docs/frameworks/next/components/inth-provider.md): Mount InthProvider once in a Next.js root layout or _app.tsx to connect server state, inth.config.ts and the consent runtime.
- [Compose your own banner](./docs/frameworks/next/compose.md): Build a custom Next.js consent banner from ConsentBanner compound parts in @inth/nextjs inside InthProvider.
- [Content Security Policy](./docs/frameworks/next/content-security-policy.md): Pass a per-request CSP nonce to InthProvider in Next.js and allow your Inth project origin in connect-src.
- [Customize](./docs/frameworks/next/customize.md): Style Inth components in Next.js with ConsentTheme tokens, component slots, dark mode, banner variants and optional CSS imports.
- [Data fetching reference](./docs/frameworks/next/data-fetching-reference.md): Reference for Next.js inth.config.ts options, modes, resolveConsent, withConsentProps, route handlers, static manifests and testing.
- [Embeds](./docs/frameworks/next/embeds.md): Keep YouTube videos, maps and third-party iframes out of Next.js pages until consent is granted using ConsentGate or the iframe blocker.
- [Geography headers](./docs/frameworks/next/geography-headers.md): Use inthProxy in Next.js proxy.ts or middleware.ts so Server Components and Route Handlers receive visitor country and region headers.
- [IAB GPP](./docs/frameworks/next/gpp.md): Add the IAB Global Privacy Platform API (__gpp) to Next.js with ConsentGPP so ad tech can read US state opt-outs and TCF strings.
- [Headless](./docs/frameworks/next/headless.md): Build a custom consent banner or embed gate in Next.js using @inth/nextjs/headless hooks inside InthProvider.
- [Hooks](./docs/frameworks/next/hooks.md): Gate features and save consent choices in Next.js Client Components with focused hooks from @inth/nextjs.
- [IAB TCF](./docs/frameworks/next/iab.md): Mount the IAB TCF banner and dialog inside a Next.js InthProvider and configure the CMP ID, policy and vendor data.
- [Network blocker](./docs/frameworks/next/network-blocker.md): Block fetch and XMLHttpRequest calls in Next.js until consent is granted with networkBlocker rules in inth.config.ts.
- [Performance](./docs/frameworks/next/optimization.md): Tune Next.js consent performance with build-time manifests, runtime cache refresh, same-origin proxying and deferred engine loading.
- [Pages Router](./docs/frameworks/next/pages-router.md): Set up Inth in the Next.js Pages Router with a build-time policy manifest, getServerSideProps and consent-gated scripts.
- [Quickstart](./docs/frameworks/next/quickstart.md): Add a cookie consent banner to a Next.js App Router app and hold back analytics until consent allows them.
- [Rendering and deployment](./docs/frameworks/next/rendering.md): Choose how Next.js resolves consent across streamed and awaited App Router layouts, Pages Router, static export, ISR and Cache Components.
- [Scripts](./docs/frameworks/next/scripts.md): Register vendor scripts in a Next.js InthProvider, manage loading and revocation, send analytics events and replace @next/third-parties.
- [Static export](./docs/frameworks/next/static-export.md): Add Inth consent management to a Next.js static export, resolving consent directly in the browser.
- [Translations](./docs/frameworks/next/translations.md): Configure banner and dialog translations in Next.js, override copy in inth.config.ts and switch languages at runtime.
- [Troubleshooting](./docs/frameworks/next/troubleshooting.md): Diagnose and fix Next.js Inth errors for manifest downloads, missing config, projectUrl, unknown server geography and prerendering.
- [Vendor consent](./docs/frameworks/next/vendor-consent.md): Let Next.js visitors toggle individual vendors inside a category with vendors in inth.config.ts and useVendorAllowed.

## Concepts

- [Choose your setup](./docs/concepts/choose-your-setup.md): Pick the Inth SDK setup for your web framework, rendering mode or native mobile platform.
- [Consent categories](./docs/concepts/consent-categories.md): Map scripts, embeds, and network rules to Inth consent categories and control which categories appear in the preference dialog.
- [Consent state reference](./docs/concepts/consent-state.md): Reference for Inth consent snapshots, save ordering, offline retries, storage sync across tabs, IAB TCF mapping, and server hydration.
- [Data fetching](./docs/concepts/data-fetching.md): Choose how your app fetches Inth policies, reports sessions, links journey IDs, and proxies consent requests on your own origin.
- [How consent works](./docs/concepts/how-consent-works.md): Learn how Inth evaluates policies, stored choices, and browser privacy signals on every page load to gate scripts and save consent.
- [Consent modes](./docs/concepts/modes.md): Reference for projectUrl, manifest(), hosted(), and testing() modes, environment variables, bundle impact, and build-time manifest downloads.
- [Policies](./docs/concepts/policies.md): Configure regional consent policies in Inth with opt-in, opt-out, IAB TCF, notice prompts, scope modes, and local testing overrides.
- [Performance](./docs/performance.md): How Inth removes /v1/consent/init latency with build-time manifests, streams SSR consent without blocking paint, and defers UI and engine JavaScript.

## Guides

- [Banner experiments](./docs/guides/banner-experiments.md): Run A/B tests on consent banner presentation with a feature flag or built-in assignment, and track impressions and choices per arm.
- [Troubleshooting](./docs/guides/troubleshooting.md): Fix missing consent banners, scripts loading before consent, CORS errors, failed manifest builds, and missing projectUrl errors in Inth.
- [Verify consent](./docs/guides/verify-consent.md): Verify in a production build that tracking scripts wait for consent, rejections persist across reloads, preferences reopen, and GPC applies.
- [Migrate from c15t](./docs/migrate-from-c15t.md): Migrate a c15t or @c15t/* app to @inth/* packages, InthProvider, hooks, callbacks, and themes while keeping visitors' stored choices.

## Customization

- [Class names and CSS-in-JS](./docs/customization/class-names.md): Style Inth consent components with CSS Modules, vanilla-extract, StyleX, Emotion, or plain classes in every supported framework.
- [Dark mode](./docs/customization/dark-mode.md): Configure Inth dark mode with colorScheme, theme.dark tokens, .dark class tracking, and flash-free SSR rendering.
- [Motion and animation](./docs/customization/motion.md): Customize Inth animation timing with motion tokens, turn animations off with disableAnimation, and animate on dialog data-state.
- [Customize the interface](./docs/customization/overview.md): Style Inth consent banners and dialogs with props, theme tokens, part classes, compound components, or headless hooks.
- [Banner designs](./docs/customization/recipes.md): Copy five tested Inth consent banner designs, from a single prop to headless markup, for React, Vue, Svelte, Astro, and HTML.
- [Component parts](./docs/customization/slots.md): Reference every Inth banner, dialog, widget, trigger, and ConsentGate part key across frameworks, plus data state attributes and noStyle.
- [Stylesheets and CSS layers](./docs/customization/stylesheets.md): Load Inth component styles automatically or manually, control CSS cascade layer order, defer dialog CSS, and disable default styles.
- [Tailwind CSS](./docs/customization/tailwind.md): Use Inth consent styles with Tailwind CSS 4 or 3, apply utility classes to component parts, and sync Tailwind dark mode.
- [Theme tokens](./docs/customization/tokens.md): Customize Inth colors, typography, radius, spacing, shadows, and motion with defineTheme(), ConsentTheme, and --inth-* CSS variables.
- [Copy and translations](./docs/customization/translations.md): Translate Inth consent banners and dialogs across built-in languages, override copy in code, configure language detection, and support RTL layouts.

## Integrations

- [ActiveCampaign](./docs/integrations/activecampaign.md): Load ActiveCampaign site tracking after marketing consent with the Inth activeCampaignTracking helper.
- [Ada](./docs/integrations/ada.md): Load Ada Messaging after functionality consent and stop the widget on revocation with the Inth ada helper.
- [Adjust](./docs/integrations/adjust.md): Gate the Adjust mobile SDK on Inth consent and send Google DMA third-party sharing in Swift, Kotlin, React Native, and Expo.
- [AdMob](./docs/integrations/admob.md): Connect AdMob limited ads, personalization, and RDP to Inth marketing consent in Swift, Kotlin, React Native, and Expo.
- [Adobe Analytics](./docs/integrations/adobe-analytics.md): Load an Adobe Data Collection Tags property for Adobe Analytics only after measurement consent with Inth.
- [Adobe Target](./docs/integrations/adobe-target.md): Gate Adobe Target at.js or Adobe Experience Platform Web SDK on experience consent with Inth.
- [AdRoll](./docs/integrations/adroll.md): Load the AdRoll pixel only after marketing consent with the Inth adrollPixel helper.
- [Ahrefs Analytics](./docs/integrations/ahrefs-analytics.md): Load Ahrefs Web Analytics only after measurement consent with the Inth ahrefsAnalytics helper.
- [Amazon Ads](./docs/integrations/amazon-ads.md): Load Amazon Ads and optional Amazon Consent Signal after marketing consent with Inth.
- [Amplitude](./docs/integrations/amplitude.md): Gate Amplitude Browser SDK 2 on web consent or sync mobile Analytics opt-out with Inth in Swift, Kotlin, React Native, and Expo.
- [Appcues](./docs/integrations/appcues.md): Load Appcues onboarding flows after experience consent and reset user state on revocation with Inth.
- [AppsFlyer](./docs/integrations/appsflyer.md): Start and stop AppsFlyer on Inth consent and send Google DMA consent data in Swift, Kotlin, React Native, and Expo.
- [Attentive](./docs/integrations/attentive.md): Load the Attentive tag only after marketing consent with the Inth attentiveTag helper.
- [Branch](./docs/integrations/branch.md): Set Branch attribution levels and Google DMA parameters from Inth consent in Swift, Kotlin, React Native, and Expo while keeping deep links working.
- [Braze](./docs/integrations/braze.md): Gate the Braze SDK on Inth consent and sync Google DMA consent attributes in Swift, Kotlin, React Native, and Expo.
- [Custom integrations](./docs/integrations/building-integrations.md): Gate a vendor without an Inth helper, or sync consent with an SDK your app already loads.
- [Clay](./docs/integrations/clay.md): Load Clay web intent only after marketing consent with the Inth clay helper.
- [Clearbit](./docs/integrations/clearbit.md): Load the Clearbit enrichment tag only after marketing consent with the Inth clearbit helper.
- [Cloudflare Web Analytics](./docs/integrations/cloudflare-web-analytics.md): Load the Cloudflare Web Analytics beacon only after measurement consent with the Inth cloudflareWebAnalytics helper.
- [Cloudflare Zaraz](./docs/integrations/cloudflare-zaraz.md): Sync Inth consent categories to Cloudflare Zaraz purposes with the callback-only cloudflareZaraz bridge.
- [Crisp](./docs/integrations/crisp.md): Load the Crisp chat widget only after functionality consent with the Inth crisp helper.
- [Customer.io](./docs/integrations/customer-io.md): Load Customer.io Data Pipelines after marketing consent, configure proxies, and reset identity on withdrawal with Inth.
- [Databuddy](./docs/integrations/databuddy.md): Load Databuddy and session replay after measurement consent, toggle tracking features, pin releases, and stop collection on withdrawal with Inth.
- [Default](./docs/integrations/default-com.md): Gate the Default Pixel on measurement or the standalone Forms SDK on functionality with Inth.
- [Dynamic Yield](./docs/integrations/dynamic-yield.md): Load Dynamic Yield scripts after experience consent, set page context, and sync Active Cookie Consent with Inth.
- [Expo Observe](./docs/integrations/expo-observe.md): Gate Expo Observe telemetry dispatching on measurement consent in Expo apps with Inth.
- [Fathom Analytics](./docs/integrations/fathom-analytics.md): Load Fathom Analytics only after measurement consent with the Inth fathomAnalytics helper.
- [Firebase Analytics](./docs/integrations/firebase-analytics.md): Connect Firebase Analytics Consent Mode v2 signals to native Inth permissions in Swift, Kotlin, React Native, and Expo.
- [Front Chat](./docs/integrations/front-chat.md): Load Front Chat after functionality consent, forward CSP nonces, and clear the chat session on withdrawal with Inth.
- [FullStory](./docs/integrations/fullstory.md): Load FullStory after measurement consent, configure regional endpoints, and handle shutdown on withdrawal with Inth.
- [Gainsight PX](./docs/integrations/gainsight-px.md): Gate Gainsight PX product analytics and in-app engagements on consent and disable tracking on withdrawal with Inth.
- [Google Maps](./docs/integrations/google-maps.md): Gate Google Maps iframe embeds on consent with ConsentGate or data-category across all supported Inth frameworks.
- [Google Tag](./docs/integrations/google-tag.md): Load gtag.js for Google Analytics or Google Ads with Inth Consent Mode v2 signals.
- [Google Tag Manager](./docs/integrations/google-tag-manager.md): Load Google Tag Manager before or after consent with Inth Consent Mode v2 signals.
- [Gorgias Chat](./docs/integrations/gorgias.md): Load Gorgias Chat after functionality consent and disable Segment tracking when measurement is denied with Inth.
- [Heap](./docs/integrations/heap.md): Load Heap config and heap.js only after measurement consent with the Inth heap helper.
- [Hightouch](./docs/integrations/hightouch.md): Load the Hightouch Events browser SDK only after measurement consent with the Inth hightouch helper.
- [Hotjar](./docs/integrations/hotjar.md): Load Hotjar only after measurement consent with the Inth hotjar helper.
- [HubSpot](./docs/integrations/hubspot.md): Load HubSpot after marketing consent, forward Inth categories, and gate chat on functionality consent.
- [Insider One](./docs/integrations/insider.md): Load Insider One after marketing consent with user attributes, currency, and page context using Inth.
- [Intercom](./docs/integrations/intercom.md): Load the Intercom Messenger only after functionality consent with the Inth intercom helper.
- [Klaviyo](./docs/integrations/klaviyo.md): Gate Klaviyo signup forms and onsite tracking on marketing and measurement consent with Inth.
- [LinkedIn Insight Tag](./docs/integrations/linkedin-insights.md): Load the LinkedIn Insight Tag only after marketing consent with the Inth linkedinInsights helper.
- [LiveIntent](./docs/integrations/liveintent.md): Load LiveIntent LiveConnect only after marketing consent with the Inth liveIntentTag helper.
- [LogRocket](./docs/integrations/logrocket.md): Load LogRocket session replay only after measurement consent with the Inth logRocket helper.
- [Lucky Orange](./docs/integrations/lucky-orange.md): Load Lucky Orange after measurement consent and sync its privacy consent status with Inth.
- [Marketo Munchkin](./docs/integrations/marketo.md): Load Adobe Marketo Munchkin only after marketing consent with the Inth marketoMunchkin helper.
- [Matomo Analytics](./docs/integrations/matomo-analytics.md): Load Matomo after measurement consent or sync Matomo consent mode with the Inth matomoAnalytics helper.
- [Meta App Events](./docs/integrations/meta-app-events.md): Sync Meta SDK automatic App Events, advertiser ID collection, and Limited Data Use with Inth consent in Swift, Kotlin, React Native, and Expo.
- [Meta Pixel](./docs/integrations/meta-pixel.md): Load the Meta Pixel only after marketing consent with the Inth metaPixel helper.
- [Microsoft Clarity](./docs/integrations/microsoft-clarity.md): Load Microsoft Clarity after measurement consent and send Consent V2 storage signals with the Inth clarity helper.
- [Microsoft UET](./docs/integrations/microsoft-uet.md): Load Microsoft Advertising UET on every page and sync ad_storage consent mode signals with the Inth microsoftUet helper.
- [Mixpanel](./docs/integrations/mixpanel-analytics.md): Connect Mixpanel tracking to Inth consent on the web, Swift, Android, React Native, and Expo.
- [OneDollarStats](./docs/integrations/one-dollar-stats.md): Load the OneDollarStats tracker only after measurement consent with the Inth oneDollarStats helper.
- [OpenAI Pixel](./docs/integrations/openai-pixel.md): Load the OpenAI ChatGPT Ads Measurement Pixel only after marketing consent with the Inth openaiPixel helper.
- [Optimizely](./docs/integrations/optimizely.md): Gate Optimizely Web Experimentation and Personalization on experience consent with Inth.
- [Oracle Eloqua](./docs/integrations/oracle-eloqua.md): Load Oracle Eloqua after marketing consent and coordinate opt-in and opt-out commands with Inth.
- [Integrations](./docs/integrations/overview.md): Connect Inth to web and mobile analytics, tag managers, ad pixels, chat widgets and embeds.
- [Pendo](./docs/integrations/pendo.md): Load and initialize Pendo only after measurement consent, with pause and resume support in Inth.
- [Pinterest Tag](./docs/integrations/pinterest-tag.md): Load the Pinterest Tag after marketing consent and sync pintrk setconsent signals with Inth.
- [Pirsch](./docs/integrations/pirsch.md): Load Pirsch Analytics after measurement consent while keeping custom event bindings working with Inth.
- [Plausible Analytics](./docs/integrations/plausible-analytics.md): Load Plausible Analytics after measurement consent with Inth and configure modern or legacy snippets.
- [PostHog](./docs/integrations/posthog.md): Gate PostHog analytics with Inth on web, Swift, Kotlin, React Native and Expo.
- [Promptwatch](./docs/integrations/promptwatch.md): Load the Promptwatch attribution client after measurement consent with Inth.
- [RB2B](./docs/integrations/rb2b.md): Load RB2B visitor identification after marketing consent with Inth, including SPA page-view guidance.
- [Reddit Pixel](./docs/integrations/reddit-pixel.md): Load the Reddit Pixel after marketing consent and disable first-party cookies on withdrawal with Inth.
- [RudderStack](./docs/integrations/rudderstack.md): Gate RudderStack on measurement consent or map Inth categories to destination consent IDs.
- [Rybbit Analytics](./docs/integrations/rybbit-analytics.md): Load Rybbit Analytics, session replay, and Web Vitals after measurement consent with Inth.
- [Salesforce Account Engagement](./docs/integrations/salesforce-pardot.md): Gate Salesforce Account Engagement tracking on marketing consent using the Tracking and Consent API or classic Pardot snippet with Inth.
- [Segment](./docs/integrations/segment.md): Load Segment Analytics.js after measurement consent and guard track and identify calls with Inth.
- [Sentry](./docs/integrations/sentry.md): Gate Sentry error monitoring, user data, and Session Replay on consent in web and mobile apps with Inth.
- [Shopify](./docs/integrations/shopify.md): Sync Inth consent choices to Shopify's Customer Privacy API from a Hydrogen storefront.
- [Singular](./docs/integrations/singular.md): Start Singular only after Inth consent allows it, then stop, resume, and limit data sharing in Swift, Android, React Native, and Expo.
- [Snapchat Pixel](./docs/integrations/snapchat-pixel.md): Load the Snapchat Pixel only after marketing consent with the Inth snapchatPixel helper.
- [Statable](./docs/integrations/statable-analytics.md): Load Statable analytics only after measurement consent with the Inth statableAnalytics helper.
- [The Trade Desk](./docs/integrations/the-trade-desk.md): Load The Trade Desk Universal Pixel only after marketing consent with the Inth theTradeDeskPixel helper.
- [TikTok Pixel](./docs/integrations/tiktok-pixel.md): Load the TikTok Pixel only after marketing consent with the Inth tiktokPixel helper.
- [Umami Analytics](./docs/integrations/umami-analytics.md): Load the Umami Analytics tracker only after measurement consent with the Inth umamiAnalytics helper.
- [Vector](./docs/integrations/vector.md): Load the Vector pixel only after marketing consent with the Inth vector helper.
- [Vercel Analytics](./docs/integrations/vercel-analytics.md): Load Vercel Web Analytics only after measurement consent with the Inth vercelAnalytics helper.
- [Vercel Speed Insights](./docs/integrations/vercel-speed-insights.md): Load Vercel Speed Insights after measurement consent and drop Web Vitals reports on revocation with Inth.
- [Wisepops](./docs/integrations/wisepops.md): Load Wisepops popups, bars, embeds, and notification feeds only after marketing consent with Inth.
- [X Pixel](./docs/integrations/x-pixel.md): Load the X Pixel only after marketing consent with the Inth xPixel helper.
- [YouTube](./docs/integrations/youtube.md): Gate YouTube video embeds behind consent with Inth using ConsentGate or data-category across all supported web frameworks.
- [Zendesk Messaging](./docs/integrations/zendesk.md): Load Zendesk Messaging after functionality consent, map measurement consent to its cookie ranges, and clear widget storage on revocation with Inth.
