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

/** Host attributes of the 24px outline icons. */
const STROKE_HOST = {
	fill: 'none',
	stroke: 'currentColor',
	'stroke-width': '2',
	viewBox: '0 0 24 24',
} as const;

/** A chevron pointing down, or up when `expanded`. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-chevron-down-icon]',
	template: `@if (expanded()) {
			<svg:path d="M19 15l-7-7-7 7" />
		} @else {
			<svg:path d="M19 9l-7 7-7-7" />
		}`,
})
export class ChevronDownIcon {
	/** Point the chevron up instead of down. */
	readonly expanded = input(false);
}

/** A chevron pointing right, or down when `expanded`. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-chevron-right-icon]',
	template: `@if (expanded()) {
			<svg:path d="M19 9l-7 7-7-7" />
		} @else {
			<svg:path d="M9 5l7 7-7 7" />
		}`,
})
export class ChevronRightIcon {
	/** Point the chevron down instead of right. */
	readonly expanded = input(false);
}

/** A close cross. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-close-icon]',
	template: `<svg:line
			x1="18"
			y1="6"
			x2="6"
			y2="18"
		/>
		<svg:line
			x1="6"
			y1="6"
			x2="18"
			y2="18"
		/>`,
})
export class CloseIcon {}

/** An external-link arrow. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-external-link-icon]',
	template: `<svg:path
			d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
		/>
		<svg:polyline points="15 3 21 3 21 9" />
		<svg:line
			x1="10"
			y1="14"
			x2="21"
			y2="3"
		/>`,
})
export class ExternalLinkIcon {}

/** A globe. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-globe-icon]',
	template: `<svg:circle
			cx="12"
			cy="12"
			r="10"
		/>
		<svg:line
			x1="2"
			y1="12"
			x2="22"
			y2="12"
		/>
		<svg:path
			d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
		/>`,
})
export class GlobeIcon {}

/** An info mark. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-info-icon]',
	template: `<svg:circle
			cx="12"
			cy="12"
			r="10"
		/>
		<svg:line
			x1="12"
			y1="16"
			x2="12"
			y2="12"
		/>
		<svg:line
			x1="12"
			y1="8"
			x2="12.01"
			y2="8"
		/>`,
})
export class InfoIcon {}

/** Stacked layers. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-layers-icon]',
	template: `<svg:path d="M12 2L2 7l10 5 10-5-10-5z" />
		<svg:path d="M2 17l10 5 10-5" />
		<svg:path d="M2 12l10 5 10-5" />`,
})
export class LayersIcon {}

/** The legitimate-interest mark. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-legitimate-interest-icon]',
	template: `<svg:path
		d="M12 3v18M3 12h18M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"
	/>`,
})
export class LegitimateInterestIcon {}

/** A padlock. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-lock-icon]',
	template: `<svg:rect
			x="3"
			y="11"
			width="18"
			height="11"
			rx="2"
			ry="2"
		/>
		<svg:path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
})
export class LockIcon {}

/** A magnifier. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-search-icon]',
	template: `<svg:circle
			cx="11"
			cy="11"
			r="8"
		/>
		<svg:line
			x1="21"
			y1="21"
			x2="16.65"
			y2="16.65"
		/>`,
})
export class SearchIcon {}

/** A share mark. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[c15t-share-icon]',
	template: `<svg:circle
			cx="18"
			cy="5"
			r="3"
		/>
		<svg:circle
			cx="6"
			cy="12"
			r="3"
		/>
		<svg:circle
			cx="18"
			cy="19"
			r="3"
		/>
		<svg:line
			x1="8.59"
			y1="13.51"
			x2="15.42"
			y2="17.49"
		/>
		<svg:line
			x1="15.41"
			y1="6.51"
			x2="8.59"
			y2="10.49"
		/>`,
})
export class ShareIcon {}
