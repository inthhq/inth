// Keep lazy module filenames neutral: Vite derives chunk URLs from them.
import type { Component, InjectionKey } from 'vue';

/** Loads one presentation's component, with its stylesheet. */
export type PrivacyChoicesPresentationLoader = () => Promise<
	Component | { default: Component }
>;

/** The Privacy Choices prompt loader for each presentation. */
export interface PrivacyChoicesPresentations {
	bar: PrivacyChoicesPresentationLoader;
	card: PrivacyChoicesPresentationLoader;
	drawer: PrivacyChoicesPresentationLoader;
}

/**
 * The Privacy Choices prompt, one chunk per presentation. Each chunk
 * brings its presentation's stylesheet, so a Drawer page never downloads
 * the Card or Banner rules, and the reverse.
 *
 * @internal
 */
export const privacyChoicesPresentations: PrivacyChoicesPresentations = {
	bar: () => import('./bar.vue'),
	card: () => import('./card.vue'),
	drawer: () => import('./drawer.vue'),
};

/**
 * Replaces {@link privacyChoicesPresentations} below the provider, so a
 * test can see which presentation the banner asks for, or fail its load.
 *
 * @internal
 */
export const privacyChoicesPresentationsKey: InjectionKey<PrivacyChoicesPresentations> =
	Symbol('inth:privacy-choices-presentations');
