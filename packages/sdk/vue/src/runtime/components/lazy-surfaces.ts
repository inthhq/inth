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
import {
	defineAsyncComponent,
	defineComponent,
	h,
	onScopeDispose,
	provide,
	watch,
} from 'vue';
import type { Component } from 'vue';

import {
	useConsentKernelContext,
	useOptInConfirmationHost,
} from '../composables/kernel';
import type { ConsentBannerView } from '../kernel';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernelContext,
	symbolSnapshot,
} from '../utils/symbols';
import { loadPrivacyChoicesDialog } from './privacy-choices-dialog/load';
import { usePrivacyChoicesDesign } from './privacy-choices/use-design';

export const LazyConsentManager = defineAsyncComponent(
	() => import('./manager.vue')
);
/**
 * The Privacy Choices dialog (`design: 'privacy-choices'`), in a chunk of
 * its own with its stylesheets. A page on the classic design never loads
 * it.
 */
export const LazyPrivacyChoicesDialog = defineAsyncComponent(
	loadPrivacyChoicesDialog
);

/**
 * The Privacy Choices dialog with the opt-in confirmation it hosts, for the
 * stock root.
 */
const LazyPrivacyChoicesDialogHost = defineAsyncComponent(
	() => import('./privacy-choices-dialog/host.vue')
);

type DialogDesign = 'classic' | 'privacy-choices';

/**
 * Mounted dialog hosts by the design each renders, so idle warming loads
 * only the dialogs a page can open: never the classic chunk and its sheets
 * for a Privacy Choices page, whatever the banner did before.
 */
const mountedDesigns: Record<DialogDesign, number> = {
	classic: 0,
	'privacy-choices': 0,
};

/**
 * Count the design this root's dialog renders while it is mounted, so
 * {@link prefetchConsentManager} warms only the dialogs on the page.
 *
 * @internal
 */
export const useWarmableDialogDesign = function useWarmableDialogDesign(
	design: () => DialogDesign
): void {
	if (typeof window === 'undefined') {
		return;
	}
	let current: DialogDesign | null = null;
	watch(
		design,
		(value) => {
			if (current) {
				mountedDesigns[current] -= 1;
			}
			current = value;
			mountedDesigns[value] += 1;
		},
		{ immediate: true }
	);
	onScopeDispose(() => {
		if (current) {
			mountedDesigns[current] -= 1;
			current = null;
		}
	});
};
export const LazyOptOutConfirmation = defineAsyncComponent(
	() => import('./opt-out-confirmation.vue')
);
export const LazyOptInConfirmation = defineAsyncComponent(
	() => import('./opt-in-confirmation.vue')
);
/**
 * Hosts the opt-in confirmation for `InthProvider` when no banner or
 * dialog on the page does, such as for a returning visitor who opts in
 * from a widget or a consent gate. It claims the host while mounted.
 *
 * @internal
 */
export const OptInConfirmationHost = defineComponent({
	name: 'OptInConfirmationHost',
	setup() {
		const active = useOptInConfirmationHost();
		return function render() {
			return active.value ? h(LazyOptInConfirmation) : null;
		};
	},
});
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

/**
 * The classic dialog warms in idle time. The Privacy Choices dialog does
 * not: importing its chunk applies its stylesheets, which include the
 * banner's in-place panel rules, and React's banner shows its folded panel
 * unstyled until the visitor reaches for it. It warms on intent instead,
 * from the banner's buttons.
 */
const loadConsentManager = () =>
	mountedDesigns.classic > 0 ? import('./manager.vue') : Promise.resolve();
const loadIabConsentDialog = () => import('./iab-panel.vue');

export const prefetchConsentManager = () =>
	prefetchSurfaceAfterLoad(loadConsentManager);
export const prefetchIabConsentDialog = () =>
	prefetchSurfaceAfterLoad(loadIabConsentDialog);

export const warmConsentManager = () => undefined;
export const warmIabConsentDialog = () => undefined;

/**
 * The stock dialog for `InthProvider`: the Privacy Choices dialog when the
 * design opts in, else the classic `ConsentManager`. Each loads in its own
 * chunk, so a page downloads only the dialog it shows.
 *
 * @internal
 */
export const ConsentDialogHost = defineComponent({
	name: 'ConsentDialogHost',
	setup() {
		const privacyChoices = usePrivacyChoicesDesign();
		return () =>
			h(
				privacyChoices.value ? LazyPrivacyChoicesDialogHost : LazyConsentManager
			);
	},
});
