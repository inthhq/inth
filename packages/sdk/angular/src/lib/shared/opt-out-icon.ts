/**
 * The official California CCPA opt-out icon, as an attribute component on
 * an `<svg>` host, and the size it takes where no stylesheet sizes it.
 *
 * @packageDocumentation
 * @internal
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils';

/**
 * The opt-out icon's own size, 14px tall at the glyph's ratio. The
 * legal-links sheet's `.optOutIcon` rule sizes it where that sheet loads;
 * on a page without it, `width` and `height` keep the icon from filling
 * the line. Unset under `noStyle`, which leaves sizing to the host.
 *
 * @internal
 */
export const OPT_OUT_ICON_SIZE: {
	readonly width: number;
	readonly height: number;
} = (() => {
	const [, , width = 30, height = 14] = CPPA_OPT_OUT_ICON.viewBox
		.split(' ')
		.map(Number);
	const tall = 14;
	return { height: tall, width: Math.round((tall * width) / height) };
})();

/**
 * Official California CCPA opt-out icon rendered beside "Privacy Choices"
 * links. Decorative next to visible text (`aria-hidden="true"`).
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.viewBox]': 'glyph.viewBox',
		'aria-hidden': 'true',
		focusable: 'false',
	},
	selector: 'svg[inth-opt-out-icon]',
	template: `@for (path of glyph.paths; track path.d) {
		<svg:path
			[attr.fill]="path.fill"
			[attr.fill-rule]="path.evenOdd ? 'evenodd' : null"
			[attr.clip-rule]="path.evenOdd ? 'evenodd' : null"
			[attr.d]="path.d"
		/>
	}`,
})
export class OptOutIcon {
	/** @internal */
	protected readonly glyph = CPPA_OPT_OUT_ICON;
}
