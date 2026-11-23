// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
/**
 * Lazy surface loading (mirrors the React adapter's chunk strategy).
 *
 * Only the non-IAB banner is statically imported by the Vue plugin's root:
 * it's the LCP-critical surface and must server-render into the first
 * HTML. Nuxt's root loads it as its own chunk too (see `nuxt-inth-provider.vue`).
 * Everything else is split:
 * - dialog: mounted once first needed; the banner warms its chunk on
 *   intent, so the first open rarely pays network+parse
 * - IAB surfaces: load only when the resolved policy is IAB (`init.gvl`)
 * - dialog trigger: mounted only in the browser, when `showTrigger` is set
 *
 * Measured motivation: with all surfaces static, @inth/vue's mobile consent
 * tax was ~345-530ms; the weight was parse/hydration
 * of surfaces most visitors never see.
 */
import { defineAsyncComponent } from 'vue';

/**
 * The banner chunk. Vite's preload helper waits for the chunk's
 * stylesheets only in the first `import()` that asks for them: keep this
 * the only caller. The Nuxt plugin calls it with the consent engine's
 * import, so both download together.
 *
 * @internal
 */
export const loadConsentBanner = () => import('./prompt/prompt.vue');

/**
 * The banner as its own chunk, for Nuxt's root. Its stylesheets then
 * belong to a lazy chunk instead of the entry: a server-rendered banner
 * paints with the styles Nuxt inlines into the HTML and hydrates once its
 * chunk arrives, and the module turns Nuxt's render-blocking links to
 * those rules into preloads. The browser applies them with the chunk,
 * before a banner it renders itself appears.
 */
export const LazyConsentBanner = defineAsyncComponent({
	// The root renders the banner component on every page (it decides its
	// own visibility), so the chunk starts loading with the app's first
	// render, not after `/v1/consent/init`.
	loader: loadConsentBanner,
	// Outside Nuxt's root `<Suspense>`: the app mounts and hydrates without
	// waiting for the banner chunk and its stylesheets. Server-rendered
	// banner markup hydrates once the chunk arrives.
	suspensible: false,
});
