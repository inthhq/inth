import { defineAsyncComponent, defineComponent, h, provide } from 'vue';
import type { Component } from 'vue';

import { useConsentKernelContext } from '../composables/use-consent-kernel';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernelContext,
	symbolSnapshot,
} from '../utils/consent-symbols.model';
import type { ConsentBannerView } from '../vue-consent-kernel-context.model';
import { LazyConsentBanner, loadConsentBanner } from './lazy-prompt';

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
