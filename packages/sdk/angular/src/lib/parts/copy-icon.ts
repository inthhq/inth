/**
 * The consent UI's copy icon, as an attribute component on `<svg>` like the
 * package's other icons. It is decorative (`aria-hidden`). `viewBox` is
 * bound, not static, so SVG keeps the attribute's case.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

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
	selector: 'svg[inth-copy-glyph]',
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
