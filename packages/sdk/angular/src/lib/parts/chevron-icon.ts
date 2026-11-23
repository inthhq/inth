/**
 * The consent UI's chevron, as an attribute component on `<svg>` like the
 * package's other icons. It is decorative (`aria-hidden`). `viewBox` is
 * bound, not static, so SVG keeps the attribute's case.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

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
	selector: 'svg[inth-chevron-glyph]',
	template: `<svg:path
		[attr.d]="direction() === 'down' ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'"
	/>`,
})
export class ChevronIcon {
	readonly direction = input<'down' | 'end'>('down');
	readonly size = input(14);
}
