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
 * <svg c15t-close-icon aria-hidden="true" width="16" height="16"></svg>
 * ```
 *
 * @packageDocumentation
 * @internal
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ɵuniqueId as uniqueId } from '@inth/angular';

/** Host attributes of the 24px outline icons. */
const STROKE_HOST = {
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': '2',
	viewBox: '0 0 24 24',
} as const;

/** The consent mark. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.aria-labelledby]': 'titleId()',
		fill: 'none',
		viewBox: '0 0 140 97',
	},
	selector: 'svg[c15t-consent-icon]',
	template: `<svg:title [attr.id]="titleId()">{{ label() }}</svg:title>
		<svg:path
			fill="currentColor"
			fill-rule="evenodd"
			d="M53.179 70.787c6.17 0 11.172-5.002 11.172-11.172 0-4.009-2.111-7.524-5.283-9.495a23.87 23.87 0 0 1 8.817-1.677c13.217 0 23.93 10.714 23.93 23.93s-10.713 23.93-23.93 23.93c-13.216 0-23.93-10.714-23.93-23.93 0-1.924.227-3.795.656-5.588a11.148 11.148 0 0 0 8.568 4.002Z"
			clip-rule="evenodd"
		/>
		<svg:path
			fill="currentColor"
			fill-rule="evenodd"
			d="M.618 74.716a68.453 68.453 0 0 1-.098-3.654c0-37.205 30.16-67.365 67.365-67.365s67.365 30.16 67.365 67.365c0 1.226-.032 2.444-.097 3.654h-21.927c.041-.776.061-1.557.061-2.343 0-24.531-19.887-44.418-44.418-44.418-24.532 0-44.418 19.887-44.418 44.418 0 .786.02 1.567.06 2.343H.618Z"
			clip-rule="evenodd"
		/>`,
})
export class ConsentIcon {
	/** The accessible name. */
	readonly label = input('Consent');
	/** The `<title>` element's id. */
	readonly titleId = input(uniqueId('consent-icon'));
}

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
	selector: 'svg[c15t-dev-tools-icon]',
	template: `<svg:path d="m18 16 4-4-4-4" />
		<svg:path d="m6 8-4 4 4 4" />
		<svg:path d="m14.5 4-5 16" />`,
})
export class DevToolsIcon {}
