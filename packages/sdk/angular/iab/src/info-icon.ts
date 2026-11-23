import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** An info mark. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-info-icon]',
	template: `<svg:circle
			cx="12"
			cy="12"
			r="10"
		/>
		<svg:line
			x1="12"
			y1="16"
			x2="12"
			y2="12"
		/>
		<svg:line
			x1="12"
			y1="8"
			x2="12.01"
			y2="8"
		/>`,
})
export class InfoIcon {}
