// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
/**
 * Lazy surface loading (mirrors the React adapter's chunk strategy).
 *
 * Only the non-IAB banner is statically imported by the Vue plugin's root:
 * it's the LCP-critical surface and must server-render into the first
 * HTML. Nuxt's root loads it as its own chunk too (see `nuxt-inth-provider.vue`).
 * Everything else is split:
 * - manager/dialog: mounted once first needed, chunk prefetched on idle so
 *   the first "customize" click never pays network+parse
 * - IAB surfaces: load only when the resolved policy is IAB (`init.gvl`)
 * - dialog trigger: mounted only in the browser, when `showTrigger` is set
 *
 * Measured motivation: with all surfaces static, @inth/vue's mobile consent
 * tax was ~345-530ms; the weight was parse/hydration
 * of surfaces most visitors never see.
 */
import { defineAsyncComponent, defineComponent, h, provide } from 'vue';
import type { Component } from 'vue';

import { useConsentKernelContext } from '../composables/kernel';
import type { ConsentBannerView } from '../kernel';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernelContext,
	symbolSnapshot,
} from '../utils/symbols';

export const LazyConsentManager = defineAsyncComponent(
	() => import('./manager.vue')
);
export const LazyOptOutConfirmation = defineAsyncComponent(
	() => import('./opt-out-confirmation.vue')
);
export const LazyOptInConfirmation = defineAsyncComponent(
	() => import('./opt-in-confirmation.vue')
);
export const LazyIabConsentBanner = defineAsyncComponent(
	() => import('./iab-prompt.vue')
);
export const LazyIabConsentDialog = defineAsyncComponent(
	() => import('./iab-panel.vue')
);

/**
 * The banner chunk. Vite's preload helper waits for the chunk's
 * stylesheets only in the first `import()` that asks for them: keep this
 * the only caller. The Nuxt plugin calls it with the consent engine's
 * import, so both download together.
 *
 * @internal
 */
export const loadConsentBanner = () => import('./prompt.vue');

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

/** The banner a deferred context renders, one per view. */
const deferredBanners = new WeakMap<ConsentBannerView, Component>();

/**
 * The banner under the Nuxt plugin's deferred context: its chunk loads
 * once the consent engine attached (the engine's chunk brings it), and it
 * hydrates against the server's snapshot, then reads the live one.
 */
const deferredBanner = function deferredBanner(
	view: ConsentBannerView
): Component {
	let banner = deferredBanners.get(view);
	if (!banner) {
		banner = defineAsyncComponent({
			hydrate: (hydrate) => {
				hydrate();
				view.hydrated();
			},
			loader: async () => {
				await view.ready;
				return loadConsentBanner();
			},
			suspensible: false,
		});
		deferredBanners.set(view, banner);
	}
	return banner;
};

/**
 * Renders the stock banner for `InthProvider`. Under a deferred context
 * the banner and its children read the context's banner view, so a choice
 * made before the banner hydrated does not change what it hydrates.
 *
 * @internal
 */
export const ConsentBannerHost = defineComponent({
	name: 'ConsentBannerHost',
	setup() {
		const view = useConsentKernelContext().bannerView;
		if (!view) {
			return () => h(LazyConsentBanner);
		}
		provide(symbolKernelContext, view.context);
		provide(symbolSnapshot, view.snapshot);
		provide(symbolInit, view.init);
		provide(symbolActiveUI, view.activeUI);
		provide(symbolConsent, view.storedConsent);
		const banner = deferredBanner(view);
		return () => h(banner);
	},
});

/**
 * The floating dialog trigger renders nothing before the page mounts, so
 * it never takes part in the first paint. Its chunk carries its
 * stylesheet, which the bundler loads before the component renders: kept
 * out of the entry, the trigger's rules no longer block the first paint of
 * every page, and a page without the trigger never downloads them.
 */
export const LazyConsentDialogTrigger = defineAsyncComponent({
	loader: () => import('./panel-trigger.vue'),
	suspensible: false,
});

/**
 * Prefetch a surface chunk WITHOUT competing with the critical path.
 *
 * Measured: prefetching on bare requestIdleCallback fired during the loading
 * window under CPU throttle and made banner-visible ~130ms WORSE on the SPA
 * arm. So we wait for the window `load` event first (banner is visible well
 * before it), then an idle slot.
 */
export const prefetchSurfaceAfterLoad = function prefetchSurfaceAfterLoad(
	load: () => Promise<unknown>
): void {
	if (typeof window === 'undefined') {
		return;
	}
	const schedule = () => {
		const idle =
			'requestIdleCallback' in window
				? (handler: () => void) =>
						(
							window as Window & {
								requestIdleCallback: (handler: () => void) => void;
							}
						).requestIdleCallback(handler)
				: (handler: () => void) => setTimeout(handler, 1500);
		idle(() => {
			void load();
		});
	};
	if (document.readyState === 'complete') {
		schedule();
	} else {
		window.addEventListener('load', schedule, { once: true });
	}
};

const loadConsentManager = () => import('./manager.vue');
const loadIabConsentDialog = () => import('./iab-panel.vue');

export const prefetchConsentManager = () =>
	prefetchSurfaceAfterLoad(loadConsentManager);
export const prefetchIabConsentDialog = () =>
	prefetchSurfaceAfterLoad(loadIabConsentDialog);

export const warmConsentManager = () => undefined;
export const warmIabConsentDialog = () => undefined;
