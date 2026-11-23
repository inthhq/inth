/**
 * The consent UI's external-link arrow, as an attribute component on `<svg>` like the
 * package's other icons. It is decorative (`aria-hidden`). `viewBox` is
 * bound, not static, so SVG keeps the attribute's case.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

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
	selector: 'svg[inth-external-glyph]',
	template:
		'<svg:path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />',
})
export class ExternalIcon {}
