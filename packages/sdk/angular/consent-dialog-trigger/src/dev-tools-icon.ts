/**
 * The stock surfaces' icons, as attribute components on an `<svg>` host.
 * Pass `class`, `width`, `height`, `aria-hidden` and `aria-label` as plain
 * attributes on the host.
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

import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Host attributes of the 24px outline icons. */
const STROKE_HOST = {
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': '2',
	viewBox: '0 0 24 24',
} as const;

/** The devtools code icon. Decorative. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		...STROKE_HOST,
		'aria-hidden': 'true',
		focusable: 'false',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
	},
	selector: 'svg[inth-dev-tools-icon]',
	template: `<svg:path d="m18 16 4-4-4-4" />
		<svg:path d="m6 8-4 4 4 4" />
		<svg:path d="m14.5 4-5 16" />`,
})
export class DevToolsIcon {}
