import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** A magnifier. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-search-icon]',
	template: `<svg:circle
			cx="11"
			cy="11"
			r="8"
		/>
		<svg:line
			x1="21"
			y1="21"
			x2="16.65"
			y2="16.65"
		/>`,
})
export class SearchIcon {}
