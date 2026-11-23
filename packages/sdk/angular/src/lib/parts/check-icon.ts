/**
 * The consent UI's check mark, as an attribute component on `<svg>` like the
 * package's other icons. It is decorative (`aria-hidden`). `viewBox` is
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
	selector: 'svg[inth-check-glyph]',
	template: '<svg:path d="M20 6 9 17l-5-5" />',
})
export class CheckIcon {
	readonly size = input(14);
}
