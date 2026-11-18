/**
 * The "Secured by" tag and the brand marks, resolved once for every
 * adapter. Each adapter renders this model as its own markup.
 */

import type { KernelBranding } from '@inth/sdk-core';

import type { AllThemeKeys } from '../theme/types';

/** Which mark a brand shows. `consent` is an older name for `inth`. */
export type BrandMark = 'inth' | 'c15t';

/** One path of a brand mark. `evenOdd` paths cut shapes out of the fill. */
export interface BrandMarkPath {
	readonly d: string;
	readonly evenOdd?: boolean;
}

/** A brand mark's `viewBox` and paths, filled with `currentColor`. */
export interface BrandMarkGlyph {
	readonly viewBox: string;
	readonly paths: readonly BrandMarkPath[];
}

/** The INTH monogram and the c15t node graph. */
export const BRAND_MARKS: Readonly<Record<BrandMark, BrandMarkGlyph>> = {
	c15t: {
		paths: [
			{
				d: 'M223.178.313c39.064 0 70.732 31.668 70.732 70.732-.001 39.064-31.668 70.731-70.732 70.731-12.181 0-23.642-3.079-33.649-8.502l-55.689 55.689a70.267 70.267 0 0 1 5.574 13.441h167.531c8.695-29.217 35.762-50.523 67.804-50.523 39.064 0 70.731 31.668 70.731 70.732s-31.668 70.732-70.731 70.732c-32.042 0-59.108-21.306-67.803-50.523H139.413a70.417 70.417 0 0 1-7.888 17.396l54.046 54.046c10.893-6.851 23.786-10.815 37.605-10.815 39.064 0 70.732 31.669 70.732 70.733 0 39.064-31.668 70.731-70.732 70.731s-70.732-31.667-70.732-70.731c0-10.518 2.296-20.499 6.414-29.471l-57.78-57.78c-8.972 4.117-18.952 6.414-29.47 6.414-39.063 0-70.731-31.668-70.732-70.732 0-39.064 31.669-70.732 70.733-70.732 12.18 0 23.642 3.079 33.649 8.502l55.688-55.688c-5.423-10.007-8.502-21.469-8.502-33.65 0-39.064 31.668-70.733 70.732-70.733Zm0 343.555c-16.742 0-30.314 13.572-30.314 30.314 0 16.741 13.572 30.313 30.314 30.313s30.314-13.572 30.314-30.313c0-16.742-13.572-30.314-30.314-30.314ZM71.611 192.299c-16.742 0-30.315 13.572-30.315 30.314s13.573 30.314 30.315 30.314c16.741 0 30.313-13.572 30.313-30.314 0-16.741-13.572-30.314-30.313-30.314Zm303.138 0c-16.729 0-30.294 13.551-30.315 30.275l.001.039-.001.038c.021 16.725 13.586 30.276 30.315 30.276 16.741 0 30.313-13.572 30.313-30.314 0-16.741-13.572-30.314-30.313-30.314ZM223.178 40.73c-16.742 0-30.314 13.573-30.314 30.315s13.573 30.313 30.314 30.313c16.742 0 30.313-13.572 30.314-30.313 0-16.742-13.572-30.314-30.314-30.315Z',
			},
		],
		viewBox: '0 0 446 445',
	},
	inth: {
		paths: [
			{
				d: 'M40.9164 0V8.26444H27.6933V26.7966H40.9164V35.0608H6.15594V26.7966H19.3788V8.26444H6.15594V0H40.9164Z',
			},
			{
				d: 'M72.1149 20.1264V0H80.0343V35.0608H74.2747L54.9798 14.8193V35.0608H47.0604V0H52.964L72.1149 20.1264Z',
			},
			{
				d: 'M71.36 41.6H88V89.6H0V41.6H61.12V31.04L71.36 41.6ZM6.15594 48.0891V56.4034H19.1784V83.2H27.4428V56.4034H40.5656V48.0891H6.15594ZM47.0603 48.1391V83.2H55.3247V70.2441H71.7531V83.2H80.0675V48.1391H71.7531V61.9797H55.3247V48.1391H47.0603Z',
				evenOdd: true,
			},
		],
		viewBox: '0 0 88 90',
	},
};

/**
 * The mark a brand shows, on the tag and on the dialog trigger. Only
 * `c15t` shows the c15t mark; every other value, and a snapshot with no
 * branding, shows the INTH mark.
 */
export const resolveBrandMark = function resolveBrandMark(
	branding: KernelBranding | null | undefined
): BrandMark {
	return branding === 'c15t' ? 'c15t' : 'inth';
};

/**
 * A brand mark as static SVG markup, for adapters that write HTML. It is
 * decorative, so it has no `<title>` and no `id` that two tags on one page
 * could repeat.
 *
 * @returns An `aria-hidden` `<svg>` string.
 */
export const brandMarkSvg = function brandMarkSvg(mark: BrandMark): string {
	const glyph = BRAND_MARKS[mark];
	const paths = glyph.paths
		.map((path) =>
			path.evenOdd
				? `<path clip-rule="evenodd" d="${path.d}" fill="currentColor" fill-rule="evenodd"></path>`
				: `<path d="${path.d}" fill="currentColor"></path>`
		)
		.join('');
	return `<svg aria-hidden="true" fill="none" viewBox="${glyph.viewBox}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
};

/** The stock surface a tag sits on. */
export type BrandingSurface =
	| 'banner'
	| 'dialog'
	| 'widget'
	| 'iab-banner'
	| 'iab-dialog';

/**
 * What each surface's tag is called: its `data-variant`, its `theme.slots`
 * key, its `components.tag` key and its `data-testid`.
 */
const SURFACE_TAGS = {
	banner: {
		componentKey: 'banner',
		slot: 'consentBannerTag',
		testId: 'consent-banner-branding',
		variant: 'banner-tag',
	},
	dialog: {
		componentKey: 'dialog',
		slot: 'consentDialogTag',
		testId: 'consent-dialog-branding',
		variant: 'dialog-tag',
	},
	'iab-banner': {
		componentKey: 'iab-banner',
		slot: 'iabConsentBannerTag',
		testId: 'iab-consent-banner-branding',
		variant: 'banner-tag',
	},
	'iab-dialog': {
		componentKey: 'iab-dialog',
		slot: 'iabConsentDialogTag',
		testId: 'iab-consent-dialog-branding',
		variant: 'dialog-tag',
	},
	widget: {
		componentKey: 'manager',
		slot: 'consentWidgetTag',
		testId: 'consent-widget-branding',
		variant: 'dialog-tag',
	},
} as const satisfies Record<
	BrandingSurface,
	{
		componentKey: string;
		slot: AllThemeKeys;
		testId: string;
		variant: 'banner-tag' | 'dialog-tag';
	}
>;

/** The `branding` stylesheet's class names, as each adapter imports them. */
export type BrandingClassNames = Readonly<Record<string, string | undefined>>;

/** Input for {@link resolveBrandingTag}. */
export interface BrandingTagInput {
	/** The snapshot's `branding`. */
	branding: KernelBranding | null | undefined;
	/** The surface the tag sits on. */
	surface: BrandingSurface;
	/**
	 * The page's hostname, sent as `?ref=`. Leave it out while server HTML
	 * hydrates, so the client's `href` matches the server's.
	 */
	hostname?: string;
	/** Drop every stock class. */
	noStyle?: boolean;
	/** The `branding` stylesheet's class names. */
	styles: BrandingClassNames;
}

/** Everything the tag's markup needs. */
export interface BrandingTag {
	/** The mark and wordmark to show, also the `data-branding` value. */
	brand: BrandMark;
	/** Opens in the same tab, as a site's own links do. */
	href: string;
	/** The `data-variant` value. */
	variant: 'banner-tag' | 'dialog-tag';
	/** The `theme.slots` key that styles the tag. */
	slot: AllThemeKeys;
	/** The `components.tag` key that styles the tag. */
	componentKey: 'banner' | 'dialog' | 'manager' | 'iab-banner' | 'iab-dialog';
	testId: string;
	/** Stock classes, empty under `noStyle`. */
	classes: {
		root: string;
		content: string;
		copy: string;
		text: string;
		wordmark: string;
		/** The c15t mark's wrapper. */
		mark: string;
		/** The c15t wordmark's text. */
		label: string;
	};
}

const join = (...names: (string | undefined)[]): string =>
	names.filter(Boolean).join(' ');

/**
 * Resolve the "Secured by" tag for one surface.
 *
 * @returns The tag, or `null` when the backend sent `branding: 'none'`.
 */
export const resolveBrandingTag = function resolveBrandingTag(
	input: BrandingTagInput
): BrandingTag | null {
	if (input.branding === 'none') {
		return null;
	}
	const brand = resolveBrandMark(input.branding);
	const surface = SURFACE_TAGS[input.surface];
	const { styles } = input;
	const cls = (...names: (string | undefined)[]): string =>
		input.noStyle ? '' : join(...names);
	const ref = input.hostname ? `?ref=${input.hostname}` : '';
	return {
		brand,
		classes: {
			content: cls(styles.brandingContent),
			copy: cls(styles.brandingCopy),
			label: cls(styles.brandingWordmarkLabel),
			mark: cls(styles.brandingC15TMark),
			root: cls(
				styles.branding,
				styles.brandingTag,
				surface.variant === 'banner-tag'
					? styles.brandingTagBanner
					: styles.brandingTagDialog
			),
			text: cls(styles.brandingText),
			wordmark: cls(
				styles.brandingWordmark,
				brand === 'inth' ? styles.brandingInth : styles.brandingC15T
			),
		},
		componentKey: surface.componentKey,
		href: `https://${brand === 'inth' ? 'inth.com' : 'c15t.com'}${ref}`,
		slot: surface.slot,
		testId: surface.testId,
		variant: surface.variant,
	};
};
