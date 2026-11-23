/**
 * The consent UI's close cross, as an attribute component on `<svg>` like the
 * package's other icons. It is decorative (`aria-hidden`). `viewBox` is
 * bound, not static, so SVG keeps the attribute's case.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

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
	selector: 'svg[inth-close-glyph]',
	template: '<svg:path d="M18 6 6 18M6 6l12 12" />',
})
export class CloseIcon {}
