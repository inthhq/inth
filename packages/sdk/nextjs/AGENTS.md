# @inth/nextjs

> Next.js v3 App Router, Pages Router, static export and hydration with Inth.

These docs ship inside the package so coding agents can read them offline. Open the topic file you need from the list below — paths are relative to this file.

## Using these docs

These docs describe inth v3. Find your app's row in Choose your setup, then follow that framework guide from start to finish; it names the files to create and the backend URL to use. A visible banner does not prove anything: check that vendor requests wait for consent, that rejection survives a reload, and that preferences can be reopened.

## Start here

- [Choose your setup](./docs/concepts/choose-your-setup.md): Pick the Inth setup for your framework, rendering mode and hosting, and decide who runs the consent backend.
- [How consent works](./docs/concepts/how-consent-works.md): What Inth decides on each page load, the difference between a permission and a recorded choice, and what happens when a visitor saves.
- [Customize the interface](./docs/customization/overview.md): Change inth's consent banner and dialog one step at a time, from a prop to your own markup, and find where each step lives in your framework.
- [Verify consent](./docs/guides/verify-consent.md): Check in a production build that vendor requests wait for consent, rejection survives a reload, preferences reopen and privacy signals apply.
- [Upgrade a Next.js app from v2](./docs/frameworks/next/upgrade-v3.md): Upgrade a Next.js app from Inth v2 (@c15t/nextjs) to v3. Covers packages, ConsentRoot or ConsentProvider, the useConsentManager codemod, callbacks, policies, styles, IAB and stored consent.

## More documentation

[Documentation index](/docs/llms.txt) · [Full Markdown context](/llms-full.txt). Prefer the index and individual pages for focused tasks.

## Frameworks

- [App Router](./docs/frameworks/next/app-router.md): Set up Inth in the Next.js App Router with Inth, a build-time policy manifest, consent-gated scripts and a streamed or awaited root layout.
- [Callbacks](./docs/frameworks/next/callbacks.md): Run code in a Next.js app when a visitor records a consent choice, when permissions change, when a request fails and before the revocation reload, from inth.config.ts.
- [Clear on revocation](./docs/frameworks/next/clear-on-revocation.md): Delete the first-party cookies and Web Storage keys a consent category owns in a Next.js app when that category is denied, with clearOnRevocation in inth.config.ts.
- [Client-side initialization](./docs/frameworks/next/client-side.md): Initialize Inth in the browser in a Next.js app with hosted() mode, without server prefetch, a consent route or API handlers.
- [Components](./docs/frameworks/next/components.md): Every Inth component a Next.js app imports from @inth/nextjs, what each renders, which ones are Client Components, and where to start.
- [ConsentBanner](./docs/frameworks/next/components/consent-banner.md): Render the pre-built ConsentBanner inside a Next.js ConsentRoot and configure its variants, per-policy buttons and compound parts.
- [ConsentDialog](./docs/frameworks/next/components/consent-dialog.md): Mount ConsentDialog as a Client Component inside a Next.js ConsentRoot to open the preference center from the banner, links and triggers.
- [ConsentDialogLink](./docs/frameworks/next/components/consent-dialog-link.md): Open the preference center from a Next.js footer with ConsentDialogLink, a Client Component that renders an unstyled button inside ConsentRoot.
- [ConsentDialogTrigger](./docs/frameworks/next/components/consent-dialog-trigger.md): Add the floating ConsentDialogTrigger button or toolbar to a Next.js ConsentRoot so visitors can reopen the preference center.
- [ConsentGate](./docs/frameworks/next/components/consent-gate.md): Consent-gate an iframe in Next.js with ConsentGate inside ConsentRoot; with server prefetch the server HTML carries the placeholder for a denied category, and a granted embed mounts after hydration.
- [ConsentRoot](./docs/frameworks/next/components/consent-root.md): Render the Next.js ConsentRoot once from a Server Component layout, pass it the server-resolved state, and see how it reads inth.config.ts and picks the consent mode.
- [ConsentWidget](./docs/frameworks/next/components/consent-widget.md): Render ConsentWidget on a Next.js privacy page inside ConsentRoot as an inline preference center, server-rendered when the route resolves consent.
- [DevTools](./docs/frameworks/next/components/dev-tools.md): Load the Inth DevTools panel only in Next.js development builds to inspect consent state, scripts, policy and events inside ConsentRoot.
- [Compose your own banner](./docs/frameworks/next/compose.md): Build a Next.js consent banner as a Client Component from the ConsentBanner parts in @inth/nextjs, with your own markup and buttons, rendered inside ConsentRoot.
- [Content Security Policy](./docs/frameworks/next/content-security-policy.md): Pass a per-request CSP nonce to ConsentRoot in Next.js and allow the consent backend in connect-src.
- [Customize](./docs/frameworks/next/customize.md): Load the Inth stylesheet yourself in Next.js when you need to, and change colors, radius, button roles, component parts, dark mode and banner shape with ConsentTheme and ConsentRoot options.
- [Data fetching reference](./docs/frameworks/next/data-fetching-reference.md): Reference for the Next.js inth.config.ts options, modes, resolveConsent, withConsentProps, the consent route, manifest resolution, request geography and local configuration.
- [Embeds](./docs/frameworks/next/embeds.md): Keep YouTube videos, maps and other iframes out of a Next.js page until their consent category is allowed, with ConsentGate or the iframe blocker in ConsentRoot.
- [Geography headers](./docs/frameworks/next/geography-headers.md): Use inthProxy in Next.js proxy.ts or middleware.ts so Server Components and Route Handlers receive the visitor's country and region.
- [IAB GPP](./docs/frameworks/next/gpp.md): Add the IAB Global Privacy Platform API (__gpp) to a Next.js app with ConsentGPP from @inth/react/gpp, so ad tech can read US state opt-outs and the TCF EU consent string.
- [Headless](./docs/frameworks/next/headless.md): Build a custom consent banner or embed gate in Next.js with the @inth/nextjs/headless hooks inside your existing ConsentRoot.
- [Hooks](./docs/frameworks/next/hooks.md): Gate features and save consent choices in Next.js Client Components with the focused hooks exported from @inth/nextjs.
- [IAB TCF](./docs/frameworks/next/iab.md): Mount the IAB TCF banner and dialog inside a Next.js ConsentRoot and configure the CMP ID, policy and vendor data.
- [Network blocker](./docs/frameworks/next/network-blocker.md): Hold fetch and XMLHttpRequest calls in a Next.js app until their consent category is allowed, with networkBlocker rules in inth.config.ts.
- [Performance](./docs/frameworks/next/optimization.md): Bundle policy at build time to avoid manifest fetch latency, use runtime caching when policies must refresh without a rebuild, and optionally keep browser consent requests on your origin.
- [Pages Router](./docs/frameworks/next/pages-router.md): Set up Inth in the Next.js Pages Router with Inth, a build-time policy manifest, getServerSideProps and consent-gated scripts.
- [Quickstart](./docs/frameworks/next/quickstart.md): Add Inth consent management to a Next.js App Router app with Inth, a build-time policy manifest and consent-gated scripts, then check it works. Links to the Pages Router and static export guides.
- [Rendering and deployment](./docs/frameworks/next/rendering.md): Choose how Next.js resolves consent for your router, rendering mode and hosting, from streamed App Router layouts to static export, ISR, Cache Components and ensureStatic.
- [Scripts](./docs/frameworks/next/scripts.md): Register vendor scripts in a Next.js ConsentRoot, check how each vendor loads, let visitors turn off one vendor, clear stored data after revocation and replace @next/third-parties.
- [Static export](./docs/frameworks/next/static-export.md): Add Inth to a Next.js site built with output export, where the browser resolves consent through Inth without request helpers or API routes.
- [Translations](./docs/frameworks/next/translations.md): Where Inth banner and dialog copy comes from in Next.js, how the server and browser pick the visitor's language, and how to override copy and switch languages from a Client Component.
- [Troubleshooting](./docs/frameworks/next/troubleshooting.md): Diagnose failed Inth consent prefetch and build-time manifest downloads in Next.js, verify manifest requests, and fix a missing inth.config.ts, config errors, unknown server location and prerendering errors.
- [Upgrade from v2](./docs/frameworks/next/upgrade-v3.md): Upgrade a Next.js app from Inth v2 (@c15t/nextjs) to v3. Covers packages, ConsentRoot or ConsentProvider, the useConsentManager codemod, callbacks, policies, styles, IAB and stored consent.
- [Vendor consent](./docs/frameworks/next/vendor-consent.md): Let visitors allow a category such as marketing in a Next.js app and still turn off one vendor in it, with vendors in inth.config.ts and useVendorAllowed.

## Concepts

- [Choose your setup](./docs/concepts/choose-your-setup.md): Pick the Inth setup for your framework, rendering mode and hosting, and decide who runs the consent backend.
- [Consent categories](./docs/concepts/consent-categories.md): Assign scripts, embeds and features to Inth consent categories, and understand which categories the preference dialog shows.
- [Consent state reference](./docs/concepts/consent-state.md): How Inth saves choices, gates IAB vendors, hydrates server records and keeps browser tabs and storage in step.
- [Data fetching](./docs/concepts/data-fetching.md): Choose the recommended build-time policy snapshot or runtime manifest fetching, backend /init, browser resolution or local rules, and understand where consent choices are saved.
- [How consent works](./docs/concepts/how-consent-works.md): What Inth decides on each page load, the difference between a permission and a recorded choice, and what happens when a visitor saves.
- [Consent modes](./docs/concepts/modes.md): Reference for projectUrl and the optional mode, manifest(), hosted() and testing(), in every Inth framework package, where each one resolves the visitor's policy, what it adds to first-load JavaScript, the build-time manifest fetch and its fallback, and the backend URL variable each framework reads.
- [Policies](./docs/concepts/policies.md): How policy models, prompts and scope decide what Inth asks visitors, where to change the rules, and why a banner may not appear.

## Guides

- [Banner experiments](./docs/guides/banner-experiments.md): Run A/B tests on consent banner presentation with any feature-flag provider or built-in weighted assignment, and attribute every impression and choice to its arm.
- [Troubleshooting](./docs/guides/troubleshooting.md): Fix a missing banner, analytics that load before consent, choices lost on reload, CORS errors, hydration differences, failed manifest downloads, mode errors and failed static builds in Inth v3.
- [Verify consent](./docs/guides/verify-consent.md): Check in a production build that vendor requests wait for consent, rejection survives a reload, preferences reopen and privacy signals apply.

## Customization

- [Class names and CSS-in-JS](./docs/customization/class-names.md): Style inth's component parts with CSS Modules, vanilla-extract, StyleX, Emotion or plain class names, and see which approach works in each framework.
- [Dark mode](./docs/customization/dark-mode.md): Switch inth's banner and dialog to dark colors with colorScheme, set your own dark tokens, follow your site's theme switch, and paint dark on the first frame in every framework.
- [Motion and animation](./docs/customization/motion.md): Change how fast inth's banner and dialog animate with duration and easing tokens, turn animations off per surface with disableAnimation, and check reduced-motion behavior in each framework.
- [Customize the interface](./docs/customization/overview.md): Change inth's consent banner and dialog one step at a time, from a prop to your own markup, and find where each step lives in your framework.
- [Banner designs](./docs/customization/recipes.md): Five consent banner designs built with Inth, from one prop to your own markup, with tested code for React, Vue, Svelte, Astro and plain HTML.
- [Component parts](./docs/customization/slots.md): Find every part of inth's banner, dialog, widget, trigger and ConsentGate placeholder, its key in your framework's part API, and the data attributes to select on.
- [Stylesheets and CSS layers](./docs/customization/stylesheets.md): See how Inth delivers its styles in each framework without a render-blocking stylesheet, when to import styles.css yourself with styles false, which file holds the dialog's rules, and how inth's cascade layer meets your own.
- [Tailwind CSS](./docs/customization/tailwind.md): Use inth's styles with Tailwind CSS 4 or 3 in every framework, put utilities on Inth component parts, and use Tailwind's dark variant with Inth.
- [Theme tokens](./docs/customization/tokens.md): Change inth's colors, type, radius, spacing, shadows and motion with theme tokens, and see every --inth-* variable with its default.
- [Copy and translations](./docs/customization/translations.md): Change consent wording through i18n and test the complete prompt and preferences flow.

## Integrations

- [ActiveCampaign](./docs/integrations/activecampaign.md): Load ActiveCampaign after marketing consent, configure its tracking settings, and verify loading and withdrawal with Inth.
- [Ada](./docs/integrations/ada.md): Load Ada Messaging after functionality consent with the Inth ada helper, configure regional Agents, and stop the widget when consent is revoked.
- [Adjust](./docs/integrations/adjust.md): Keep the Adjust SDK disabled until Inth consent allows it and send third-party sharing with Google's DMA options, in Swift, Kotlin, React Native and Expo.
- [AdMob](./docs/integrations/admob.md): Connect Google Mobile Ads (AdMob) to native Inth consent in Swift, Kotlin, React Native and Expo, with limited ads, personalization and restricted data processing driven by marketing.
- [Adobe Analytics](./docs/integrations/adobe-analytics.md): Load an Adobe Data Collection Tags property only after measurement consent with the Inth adobeAnalytics helper, and check its extensions in DevTools.
- [Adobe Target](./docs/integrations/adobe-target.md): Gate a self-hosted Adobe Target at.js download or Adobe Experience Platform Web SDK on experience consent, send consent updates and check revocation limits.
- [AdRoll](./docs/integrations/adroll.md): Load AdRoll with Inth after marketing consent and verify its loader, storage and revocation behavior.
- [Ahrefs Analytics](./docs/integrations/ahrefs-analytics.md): Load Ahrefs Web Analytics only after measurement consent with the Inth ahrefsAnalytics helper, and check it in DevTools.
- [Amazon Ads](./docs/integrations/amazon-ads.md): Load Amazon Ads with Inth after marketing consent and verify its loader, storage and revocation behavior.
- [Amplitude](./docs/integrations/amplitude.md): Load Amplitude Browser SDK 2 after web consent, or connect Amplitude Analytics opt-out in Swift, Kotlin, React Native and Expo, with withdrawal and reset handling.
- [Appcues](./docs/integrations/appcues.md): Load Appcues onboarding flows after experience consent, configure US or EU accounts, and reset the visitor on revocation.
- [AppsFlyer](./docs/integrations/appsflyer.md): Run AppsFlyer only while Inth consent allows it and send Google's DMA consent through AppsFlyer's consent API, in Swift, Kotlin, React Native and Expo.
- [Attentive](./docs/integrations/attentive.md): Load the Attentive tag only after marketing consent with the Inth attentiveTag helper, and check its requests and storage in DevTools.
- [Branch](./docs/integrations/branch.md): Set Branch's consumer protection attribution level and Google DMA parameters from Inth consent in Swift, Kotlin, React Native and Expo, while deep links keep working.
- [Braze](./docs/integrations/braze.md): Keep the Braze SDK disabled until Inth consent allows it and record Google's DMA consent attributes on the Braze user, in Swift, Kotlin, React Native and Expo.
- [Custom integrations](./docs/integrations/building-integrations.md): Gate a vendor that has no @inth/integrations helper, or sync consent with an SDK your app already loads, using a Inth script configuration.
- [Clay](./docs/integrations/clay.md): Load Clay web intent only after marketing consent and understand its storage and revocation limits.
- [Clearbit](./docs/integrations/clearbit.md): Load the Clearbit enrichment tag only after marketing consent with the Inth clearbit helper, and check it in DevTools.
- [Cloudflare Web Analytics](./docs/integrations/cloudflare-web-analytics.md): Load the Cloudflare Web Analytics beacon only after measurement consent with the Inth cloudflareWebAnalytics helper, and check it in DevTools.
- [Cloudflare Zaraz](./docs/integrations/cloudflare-zaraz.md): Sync Inth permissions to Cloudflare Zaraz purposes with the Inth cloudflareZaraz bridge, which runs on every page without loading a script, and check the tools it controls.
- [Crisp](./docs/integrations/crisp.md): Load the Crisp chat widget only after functionality consent with the Inth crisp helper, pass its runtime settings and check it in DevTools.
- [Customer.io](./docs/integrations/customer-io.md): Load Customer.io Data Pipelines only after marketing consent with the Inth customerIo helper, set up a proxy, and check withdrawal.
- [Databuddy](./docs/integrations/databuddy.md): Load Databuddy only after measurement consent with the Inth databuddy helper, turn off tracking features you do not use, record sessions with the replay option, and check revocation in DevTools.
- [Default](./docs/integrations/default-com.md): Load the Default Pixel after measurement consent or the standalone Forms SDK after functionality consent, configure loading and understand withdrawal limits.
- [Dynamic Yield](./docs/integrations/dynamic-yield.md): Load Dynamic Yield personalization scripts after experience consent, set the page context and synchronize Active Cookie Consent with Inth.
- [Expo Observe](./docs/integrations/expo-observe.md): Gate Expo Observe (EAS Observe) in Expo apps with Inth. Observe records on the device from native launch, so Inth can only turn its sending on and off.
- [Fathom Analytics](./docs/integrations/fathom-analytics.md): Load Fathom Analytics only after measurement consent with the Inth fathomAnalytics helper, set its SPA mode, and check it in DevTools.
- [Firebase Analytics](./docs/integrations/firebase-analytics.md): Connect Firebase Analytics to native Inth permissions in Swift, Kotlin, React Native and Expo, with withdrawal, reset and startup handling.
- [Front Chat](./docs/integrations/front-chat.md): Load the Front Chat widget only after functionality consent with the Inth frontChat helper, forward CSP nonces, clear the session on revocation and check it in DevTools.
- [FullStory](./docs/integrations/fullstory.md): Load FullStory after measurement consent, configure its tracking settings, and verify loading and withdrawal with Inth.
- [Gainsight PX](./docs/integrations/gainsight-px.md): Gate Gainsight PX product analytics and in-app engagements on consent, configure the aptrinsic snippet and disable tracking when consent is withdrawn.
- [Google Maps](./docs/integrations/google-maps.md): Gate a Google Maps iframe embed with Inth v3 so the map loads only after the visitor allows its consent category, in Next.js, TanStack Start, React, Nuxt, Vue, Astro, Svelte, SvelteKit, HTML or JavaScript.
- [Google Tag](./docs/integrations/google-tag.md): Load gtag.js for Google Analytics or Google Ads before or after consent with Inth Consent Mode v2 signals, and verify the consent commands in DevTools.
- [Google Tag Manager](./docs/integrations/google-tag-manager.md): Load a Google Tag Manager container before or after consent with Inth Consent Mode v2 signals, configure consent checks inside the container, and verify both in DevTools.
- [Gorgias Chat](./docs/integrations/gorgias.md): Load Gorgias Chat after functionality consent, disable its Segment analytics when measurement is denied, and verify loading and revocation with Inth.
- [Heap](./docs/integrations/heap.md): Load the Heap config script and heap.js only after measurement consent with the Inth heap helper, and check it in DevTools.
- [Hightouch](./docs/integrations/hightouch.md): Load the Hightouch Events browser SDK only after measurement consent with the Inth hightouch helper, and check page events in DevTools.
- [Hotjar](./docs/integrations/hotjar.md): Load Hotjar only after measurement consent with the Inth hotjar helper, and check its loader and recordings in DevTools.
- [HubSpot](./docs/integrations/hubspot.md): Gate HubSpot's tracking code on marketing consent, forward Inth categories and enable chat only after functionality consent.
- [Insider One](./docs/integrations/insider.md): Load Insider One after consent with current user attributes, currency and page context through the Inth insiderTag helper.
- [Intercom](./docs/integrations/intercom.md): Load the Intercom messenger only after functionality consent with the Inth intercom helper, set its region and check it in DevTools.
- [Klaviyo](./docs/integrations/klaviyo.md): Load Klaviyo signup forms and onsite tracking only after marketing and measurement consent with the Inth klaviyo helper, gate your own events, and check it in DevTools.
- [LinkedIn Insight Tag](./docs/integrations/linkedin-insights.md): Load the LinkedIn Insight Tag only after marketing consent with the Inth linkedinInsights helper, guard lintrk conversion calls, and check it in DevTools.
- [LiveIntent](./docs/integrations/liveintent.md): Load LiveIntent with Inth after marketing consent and verify its loader, storage and revocation behavior.
- [LogRocket](./docs/integrations/logrocket.md): Load LogRocket session replay only after measurement consent with the Inth logRocket helper, including proxied setups, and check it in DevTools.
- [Lucky Orange](./docs/integrations/lucky-orange.md): Load Lucky Orange after measurement consent, configure its tracking settings, and verify loading and withdrawal with Inth.
- [Marketo Munchkin](./docs/integrations/marketo.md): Load Adobe Marketo Munchkin after marketing consent, configure its account and cookie options, and verify tracking and revocation with Inth.
- [Matomo Analytics](./docs/integrations/matomo-analytics.md): Load Matomo after measurement consent with the Inth matomoAnalytics helper, or use Matomo's own consent mode, and check each mode in DevTools.
- [Meta App Events](./docs/integrations/meta-app-events.md): Connect the Meta (Facebook) SDK's automatic App Events, advertiser ID collection and Limited Data Use to Inth consent in Swift, Kotlin, React Native and Expo.
- [Meta Pixel](./docs/integrations/meta-pixel.md): Load the Meta Pixel only after marketing consent with the Inth metaPixel helper, guard fbq event calls, and check it in DevTools.
- [Microsoft Clarity](./docs/integrations/microsoft-clarity.md): Load Microsoft Clarity only after measurement consent with the Inth clarity helper, send Consent V2 storage signals and check them in DevTools.
- [Microsoft UET](./docs/integrations/microsoft-uet.md): Load Microsoft Advertising UET on every page with the Inth microsoftUet helper, send ad_storage consent defaults and updates, and verify both in DevTools.
- [Mixpanel](./docs/integrations/mixpanel-analytics.md): Connect Mixpanel tracking to Inth consent on the web, Swift, Android, React Native and Expo, including startup, withdrawal and reset handling.
- [OneDollarStats](./docs/integrations/one-dollar-stats.md): Load the OneDollarStats tracker only after measurement consent with the Inth oneDollarStats helper, forward its data-attribute settings, and check it in DevTools.
- [OpenAI Pixel](./docs/integrations/openai-pixel.md): Load the ChatGPT Ads Measurement Pixel only after marketing consent with the Inth openaiPixel helper, guard oaiq conversion calls, and check it in DevTools.
- [Optimizely](./docs/integrations/optimizely.md): Load Optimizely Web Experimentation and Personalization after experience consent with Inth, choose a consent category and understand revocation limits.
- [Oracle Eloqua](./docs/integrations/oracle-eloqua.md): Load Oracle Eloqua after mapped category and vendor consent, configure its tracking settings, and verify loading and withdrawal with Inth.
- [Integrations](./docs/integrations/overview.md): Find Inth integrations for web and mobile analytics, tag managers, advertising, experimentation, email, chat and embedded content.
- [Pendo](./docs/integrations/pendo.md): Load Pendo after measurement consent, configure its tracking settings, and verify loading and withdrawal with Inth.
- [Pinterest Tag](./docs/integrations/pinterest-tag.md): Load the Pinterest Tag only after marketing consent with the Inth pinterestTag helper, guard pintrk event calls, and check it in DevTools.
- [Pirsch](./docs/integrations/pirsch.md): Load Pirsch Analytics only after measurement consent with the Inth pirsch helper, keep custom event bindings working, and check it in DevTools.
- [Plausible Analytics](./docs/integrations/plausible-analytics.md): Load the Plausible Analytics tracker only after measurement consent with the Inth plausibleAnalytics helper, and check it in DevTools.
- [PostHog](./docs/integrations/posthog.md): Connect PostHog to Inth permissions on the web, Swift, Kotlin, React Native and Expo, with startup, capture and withdrawal handling.
- [Promptwatch](./docs/integrations/promptwatch.md): Load the Promptwatch attribution client only after measurement consent with the Inth promptwatch helper, and check it in DevTools.
- [RB2B](./docs/integrations/rb2b.md): Load RB2B only after marketing consent with the Inth rb2b helper, and check its loader URL, page views and revocation.
- [Reddit Pixel](./docs/integrations/reddit-pixel.md): Load the Reddit Pixel only after marketing consent with the Inth redditPixel helper, guard rdt conversion calls, and check it in DevTools.
- [RudderStack](./docs/integrations/rudderstack.md): Load the RudderStack JavaScript SDK after measurement consent with the Inth rudderstack helper, or map Inth categories to destination consent IDs, and check each mode.
- [Rybbit Analytics](./docs/integrations/rybbit-analytics.md): Load Rybbit Analytics only after measurement consent with the Inth rybbitAnalytics helper, map its tracking options to data attributes, and check it in DevTools.
- [Salesforce Account Engagement](./docs/integrations/salesforce-pardot.md): Gate Salesforce Account Engagement tracking on marketing consent, configure its consent API or classic Pardot snippet, and verify revocation with Inth.
- [Segment](./docs/integrations/segment.md): Load Segment Analytics.js only after measurement consent with the Inth segment helper, guard your own track and identify calls, and check it in DevTools.
- [Sentry](./docs/integrations/sentry.md): Configure consent for Sentry error monitoring, user data and Session Replay on the web, and manual replay in Swift, Kotlin, React Native and Expo.
- [Shopify](./docs/integrations/shopify.md): Send Inth consent to Shopify's Customer Privacy API from a Hydrogen storefront, so Shopify analytics wait for the visitor's choice and follow each later change.
- [Singular](./docs/integrations/singular.md): Start Singular only after Inth consent allows it, then stop, resume and limit its data sharing in Swift, Kotlin, React Native and Expo, with Google's DMA signals passed through Singular.
- [Snapchat Pixel](./docs/integrations/snapchat-pixel.md): Load the Snapchat Pixel only after marketing consent with the Inth snapchatPixel helper, guard snaptr event calls, and check it in DevTools.
- [Statable](./docs/integrations/statable-analytics.md): Load Statable analytics after measurement consent with the Inth statableAnalytics helper, configure its ingestion endpoint, and verify requests and browser storage.
- [The Trade Desk](./docs/integrations/the-trade-desk.md): Load The Trade Desk with Inth after marketing consent and verify its loader, storage and revocation behavior.
- [TikTok Pixel](./docs/integrations/tiktok-pixel.md): Load the TikTok Pixel only after marketing consent with the Inth tiktokPixel helper, guard ttq event calls, and check it in DevTools.
- [Umami Analytics](./docs/integrations/umami-analytics.md): Load the Umami Analytics tracker only after measurement consent with the Inth umamiAnalytics helper, point it at a self-hosted instance, and check it in DevTools.
- [Vector](./docs/integrations/vector.md): Load the Vector pixel only after marketing consent with the Inth vector helper, and check its queue, storage and revocation.
- [Vercel Analytics](./docs/integrations/vercel-analytics.md): Load the Vercel Web Analytics script only after measurement consent with the Inth vercelAnalytics helper, choose the debug script, and check it in DevTools.
- [Vercel Speed Insights](./docs/integrations/vercel-speed-insights.md): Load the Vercel Speed Insights collector only after measurement consent with the Inth vercelSpeedInsights helper, drop Web Vitals reports on revocation, and check it in DevTools.
- [Wisepops](./docs/integrations/wisepops.md): Load Wisepops popups, bars, embeds and notification feeds after marketing consent with Inth. Configure its site ID, cookie options and reload behavior.
- [X Pixel](./docs/integrations/x-pixel.md): Load the X Pixel only after marketing consent with the Inth xPixel helper, guard twq conversion events, and check it in DevTools.
- [YouTube](./docs/integrations/youtube.md): Gate YouTube embeds with Inth v3 in Next.js, TanStack Start, React, Nuxt, Vue, Astro, Svelte, SvelteKit or JavaScript.
- [Zendesk Messaging](./docs/integrations/zendesk.md): Load the Zendesk Messaging Web Widget after functionality consent, map measurement consent to its cookie ranges and clear widget storage on revocation.
