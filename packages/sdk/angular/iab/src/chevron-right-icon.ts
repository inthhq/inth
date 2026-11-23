import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** A chevron pointing right, or down when `expanded`. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-chevron-right-icon]',
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
