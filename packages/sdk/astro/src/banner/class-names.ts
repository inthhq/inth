/**
 * The stylesheet class names the IAB banner's markup uses.
 *
 * Imported on the server only. The browser-rendered banner receives these
 * through the spot `<IABConsentBanner />` leaves for it rather than importing
 * the class maps itself: in the browser those modules also import their
 * stylesheets, and Astro links every stylesheet a page script can reach,
 * so the page would carry a second copy of rules the integration already
 * injects.
 */

import brandingStyles from '@inth/sdk/ui/styles/components/branding';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import actionStyles from '@inth/sdk/ui/styles/components/consent-actions';
import iabBannerStyles from '@inth/sdk/ui/styles/components/iab-consent-banner';

/** Class names for one component, keyed by the stylesheet's own names. */
export type ClassNameMap = Record<string, string | undefined>;

/** The class maps the IAB banner and its branding tag read. */
export interface IABPromptClassNames {
	iabBanner: ClassNameMap;
	actions: ClassNameMap;
	button: ClassNameMap;
	branding: ClassNameMap;
}

const pick = function pick(
	source: Record<string, string>,
	keys: string[]
): ClassNameMap {
	return Object.fromEntries(keys.map((key) => [key, source[key]]));
};

/**
 * Join class names, skipping empty ones.
 *
 * @param names - Class names, possibly missing.
 * @returns A space-separated class list.
 */
export const joinClasses = function joinClasses(
	...names: (string | undefined)[]
): string {
	return names.filter(Boolean).join(' ');
};

/** The IAB banner's class names, trimmed to the ones its markup uses. */
export const iabPromptClassNames: IABPromptClassNames = {
	actions: pick(actionStyles, ['actionGroup', 'actionRoot']),
	branding: pick(brandingStyles, [
		'branding',
		'brandingC15T',
		'brandingC15TMark',
		'brandingContent',
		'brandingCopy',
		'brandingInth',
		'brandingTag',
		'brandingTagBanner',
		'brandingTagDialog',
		'brandingText',
		'brandingWordmark',
		'brandingWordmarkLabel',
	]),
	button: pick(buttonStyles, ['button']),
	iabBanner: pick(iabBannerStyles, [
		'bannerEntering',
		'bannerVisible',
		'card',
		'cardShell',
		'description',
		'footer',
		'header',
		'legitimateInterestNotice',
		'overlay',
		'overlayEntering',
		'overlayVisible',
		'partnersLink',
		'purposeList',
		'purposeMore',
		'root',
		'title',
	]),
};
