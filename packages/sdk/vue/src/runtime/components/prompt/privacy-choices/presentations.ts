// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import { defineAsyncComponent } from 'vue';
import type { Component, InjectionKey } from 'vue';

/** The Privacy Choices prompt component for each presentation. */
export interface PrivacyChoicesPresentations {
	bar: Component;
	card: Component;
	drawer: Component;
}

/**
 * The Privacy Choices prompt, one chunk per presentation. Each chunk
 * brings its presentation's stylesheet, so a Drawer page never downloads
 * the Card or Banner rules, and the reverse.
 *
 * @internal
 */
export const privacyChoicesPresentations: PrivacyChoicesPresentations = {
	bar: defineAsyncComponent({
		loader: () => import('./bar.vue'),
		suspensible: false,
	}),
	card: defineAsyncComponent({
		loader: () => import('./card.vue'),
		suspensible: false,
	}),
	drawer: defineAsyncComponent({
		loader: () => import('./drawer.vue'),
		suspensible: false,
	}),
};

/**
 * Replaces {@link privacyChoicesPresentations} below the provider, so a
 * test can see which presentation the banner asks for.
 *
 * @internal
 */
export const privacyChoicesPresentationsKey: InjectionKey<PrivacyChoicesPresentations> =
	Symbol('inth:privacy-choices-presentations');
