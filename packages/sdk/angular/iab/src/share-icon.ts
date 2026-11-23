import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** A share mark. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-share-icon]',
	template: `<svg:circle
			cx="18"
			cy="5"
			r="3"
		/>
		<svg:circle
			cx="6"
			cy="12"
			r="3"
		/>
		<svg:circle
			cx="18"
			cy="19"
			r="3"
		/>
		<svg:line
			x1="8.59"
			y1="13.51"
			x2="15.42"
			y2="17.49"
		/>
		<svg:line
			x1="15.41"
			y1="6.51"
			x2="8.59"
			y2="10.49"
		/>`,
})
export class ShareIcon {}
