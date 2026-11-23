/**
 * The CCPA opt-out icon beside "Your Privacy Choices", sized on its own.
 *
 * The `legal-links` sheet's `.optOutIcon` rule sizes it, but a page that
 * shows only the prompt never loads that sheet. So unless the host asked
 * for no styling, the SVG carries the glyph's intrinsic size: 14px tall
 * and as wide as its `viewBox` ratio, as React's `OptOutIcon` does. A
 * stylesheet that sizes it still wins, since CSS beats presentation
 * attributes.
 *
 * @internal
 */

import {
	CPPA_OPT_OUT_ICON,
	cppaOptOutIconSvg,
} from '@inth/sdk/ui/utils/opt-out-icon';

/** The icon's rendered height, in CSS pixels. */
export const OPT_OUT_ICON_HEIGHT = 14;

/** The icon's rendered width: its `viewBox` ratio at {@link OPT_OUT_ICON_HEIGHT}. */
export const OPT_OUT_ICON_WIDTH = (() => {
	const [, , width = 30, height = 14] = CPPA_OPT_OUT_ICON.viewBox
		.split(/\s+/u)
		.map(Number);
	return Math.round((OPT_OUT_ICON_HEIGHT * width * 100) / height) / 100;
})();

/**
 * The opt-out icon's markup for a "Your Privacy Choices" link.
 *
 * @param className - The icon's class, or none under `noStyle`.
 * @param sized - Give the SVG its intrinsic size; `false` under `noStyle`.
 */
export const privacyChoicesLinkIconSvg = function privacyChoicesLinkIconSvg(
	className: string | undefined,
	sized: boolean
): string {
	const svg = cppaOptOutIconSvg(className);
	return sized
		? svg.replace(
				'<svg ',
				`<svg height="${OPT_OUT_ICON_HEIGHT}" width="${OPT_OUT_ICON_WIDTH}" `
			)
		: svg;
};
