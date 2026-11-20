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
 * <svg inth-brand-mark-icon [mark]="'inth'" width="16" height="16"></svg>
 * ```
 *
 * @packageDocumentation
 * @internal
 */

import {
	ChangeDetectionStrategy,
	Component,
	computed,
	input,
} from '@angular/core';
import { BRAND_MARKS, CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils';
import type { BrandMark } from '@inth/sdk/ui/utils';

/**
 * A brand mark, decorative: the INTH monogram or the c15t mark.
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[attr.viewBox]': 'glyph().viewBox',
		'aria-hidden': 'true',
		fill: 'none',
	},
	selector: 'svg[inth-brand-mark-icon]',
	template: `@for (path of glyph().paths; track path.d) {
		<svg:path
			fill="currentColor"
			[attr.fill-rule]="path.evenOdd ? 'evenodd' : null"
			[attr.clip-rule]="path.evenOdd ? 'evenodd' : null"
			[attr.d]="path.d"
		/>
	}`,
})
export class BrandMarkIcon {
	/** Which mark to draw. */
	readonly mark = input.required<BrandMark>();
	/** @internal */
	protected readonly glyph = computed(() => BRAND_MARKS[this.mark()]);
}

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
