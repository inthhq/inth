import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** A close cross. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-close-icon]',
	template: `<svg:line
			x1="18"
			y1="6"
			x2="6"
			y2="18"
		/>
		<svg:line
			x1="6"
			y1="6"
			x2="18"
			y2="18"
		/>`,
})
export class CloseIcon {}
