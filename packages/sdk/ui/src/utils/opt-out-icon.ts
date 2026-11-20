/**
 * Official California CCPA opt-out icon (`privacyoptions.svg`), shared across
 * adapters so every "Privacy Choices" opt-out link renders the mandated mark.
 *
 * Source: https://oag.ca.gov/privacy/ccpa/icons-download
 * Asset: https://oag.ca.gov/sites/all/files/agweb/images/privacy/privacyoptions.svg
 *
 * Path data and colors (`#0066FF`, `#FFFFFF`) are taken unchanged from the
 * official SVG and stay fixed across light and dark themes.
 */

/** One path of the CPPA opt-out icon with its fixed fill color. */
export interface OptOutIconPath {
	readonly d: string;
	readonly fill: '#FFFFFF' | '#0066FF';
	readonly evenOdd?: boolean;
}

/** The CPPA opt-out icon's `viewBox` and paths. */
export interface OptOutIconGlyph {
	readonly viewBox: string;
	readonly paths: readonly OptOutIconPath[];
}

/**
 * Official California CCPA opt-out icon geometry and fixed colors.
 *
 * Source: https://oag.ca.gov/sites/all/files/agweb/images/privacy/privacyoptions.svg
 */
export const CPPA_OPT_OUT_ICON: OptOutIconGlyph = {
	paths: [
		{
			d: 'M7.4,12.8h6.8l3.1-11.6H7.4C4.2,1.2,1.6,3.8,1.6,7S4.2,12.8,7.4,12.8z',
			evenOdd: true,
			fill: '#FFFFFF',
		},
		{
			d: 'M22.6,0H7.4c-3.9,0-7,3.1-7,7s3.1,7,7,7h15.2c3.9,0,7-3.1,7-7S26.4,0,22.6,0z M1.6,7c0-3.2,2.6-5.8,5.8-5.8 h9.9l-3.1,11.6H7.4C4.2,12.8,1.6,10.2,1.6,7z',
			evenOdd: true,
			fill: '#0066FF',
		},
		{
			d: 'M24.6,4c0.2,0.2,0.2,0.6,0,0.8l0,0L22.5,7l2.2,2.2c0.2,0.2,0.2,0.6,0,0.8c-0.2,0.2-0.6,0.2-0.8,0 l0,0l-2.2-2.2L19.5,10c-0.2,0.2-0.6,0.2-0.8,0c-0.2-0.2-0.2-0.6,0-0.8l0,0L20.8,7l-2.2-2.2c-0.2-0.2-0.2-0.6,0-0.8 c0.2-0.2,0.6-0.2,0.8,0l0,0l2.2,2.2L23.8,4C24,3.8,24.4,3.8,24.6,4z',
			fill: '#FFFFFF',
		},
		{
			d: 'M12.7,4.1c0.2,0.2,0.3,0.6,0.1,0.8l0,0L8.6,9.8C8.5,9.9,8.4,10,8.3,10c-0.2,0.1-0.5,0.1-0.7-0.1l0,0 L5.4,7.7c-0.2-0.2-0.2-0.6,0-0.8c0.2-0.2,0.6-0.2,0.8,0l0,0L8,8.6l3.8-4.5C12,3.9,12.4,3.9,12.7,4.1z',
			fill: '#0066FF',
		},
	],
	viewBox: '0 0 30 14',
};

/**
 * The CPPA opt-out icon as static SVG markup, for adapters that write HTML.
 * The icon is decorative next to visible link text, so it sets `aria-hidden`
 * and carries no `<title>` or `id`.
 *
 * @param className - Optional class attribute for the `<svg>` element.
 * @returns An `aria-hidden` `<svg>` string.
 */
export const cppaOptOutIconSvg = function cppaOptOutIconSvg(
	className?: string
): string {
	const paths = CPPA_OPT_OUT_ICON.paths
		.map((path) =>
			path.evenOdd
				? `<path clip-rule="evenodd" d="${path.d}" fill="${path.fill}" fill-rule="evenodd"></path>`
				: `<path d="${path.d}" fill="${path.fill}"></path>`
		)
		.join('');
	const classAttr = className ? ` class="${className}"` : '';
	return `<svg aria-hidden="true"${classAttr} focusable="false" viewBox="${CPPA_OPT_OUT_ICON.viewBox}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
};
