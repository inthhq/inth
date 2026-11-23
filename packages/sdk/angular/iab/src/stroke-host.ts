/**
 * The host attributes the stock surfaces' outline icons share. Each icon is
 * an attribute component on an `<svg>` host, in its own file. Pass `class`,
 * `width`, `height`, `aria-hidden` and `aria-label` as plain attributes on
 * the host.
 *
 * Selectors are lowercase dash-case, as Angular asks of components with
 * attribute selectors. That also suits SVG: its attribute names keep their
 * case, but the HTML parser lowercases them in server HTML, so a camelCase
 * selector attribute would be added a second time on hydration.
 *
 * @example
 * ```html
 * <svg inth-close-icon aria-hidden="true" width="16" height="16"></svg>
 * ```
 *
 * @packageDocumentation
 * @internal
 */

/** Host attributes of the 24px outline icons. @internal */
export const STROKE_HOST = {
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': '2',
	viewBox: '0 0 24 24',
} as const;
