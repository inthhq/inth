import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** A chevron pointing down, or up when `expanded`. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-chevron-down-icon]',
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
