import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** A globe. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-globe-icon]',
	template: `<svg:circle
			cx="12"
			cy="12"
			r="10"
		/>
		<svg:line
			x1="2"
			y1="12"
			x2="22"
			y2="12"
		/>
		<svg:path
			d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
		/>`,
})
export class GlobeIcon {}
