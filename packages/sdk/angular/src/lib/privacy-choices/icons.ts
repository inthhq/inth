/**
 * The Privacy Choices icons, as attribute components on `<svg>` like the
 * package's other icons. Each is decorative (`aria-hidden`). `viewBox` is
 * bound, not static, so SVG keeps the attribute's case.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A check mark. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.height]': 'size()',
		'[attr.viewBox]': '"0 0 24 24"',
		'[attr.width]': 'size()',
		'aria-hidden': 'true',
		fill: 'none',
		stroke: 'currentColor',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'stroke-width': '2.5',
	},
	selector: 'svg[inth-pc-check]',
	template: '<svg:path d="M20 6 9 17l-5-5" />',
})
export class CheckIcon {
	readonly size = input(14);
}

/** A chevron pointing down, or toward the inline end. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.height]': 'size()',
		'[attr.viewBox]': '"0 0 24 24"',
		'[attr.width]': 'size()',
		'aria-hidden': 'true',
		fill: 'none',
		stroke: 'currentColor',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'stroke-width': '2',
	},
	selector: 'svg[inth-pc-chevron]',
	template: `<svg:path
		[attr.d]="direction() === 'down' ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'"
	/>`,
})
export class ChevronIcon {
	readonly direction = input<'down' | 'end'>('down');
	readonly size = input(14);
}

/** The external-link arrow on a vendor's privacy policy link. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.viewBox]': '"0 0 24 24"',
		'aria-hidden': 'true',
		fill: 'none',
		height: '13',
		stroke: 'currentColor',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'stroke-width': '2',
		width: '13',
	},
	selector: 'svg[inth-pc-external]',
	template:
		'<svg:path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />',
})
export class ExternalIcon {}

/** The close cross. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.viewBox]': '"0 0 24 24"',
		'aria-hidden': 'true',
		fill: 'none',
		height: '16',
		stroke: 'currentColor',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'stroke-width': '2',
		width: '16',
	},
	selector: 'svg[inth-pc-close]',
	template: '<svg:path d="M18 6 6 18M6 6l12 12" />',
})
export class CloseIcon {}

/** The copy icon on the receipt reference. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.viewBox]': '"0 0 24 24"',
		'aria-hidden': 'true',
		fill: 'none',
		height: '14',
		stroke: 'currentColor',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'stroke-width': '2',
		width: '14',
	},
	selector: 'svg[inth-pc-copy]',
	template: `<svg:rect
			x="9"
			y="9"
			width="13"
			height="13"
			rx="2"
		/>
		<svg:path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />`,
})
export class CopyIcon {}
