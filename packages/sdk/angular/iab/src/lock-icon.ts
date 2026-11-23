import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** A padlock. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-lock-icon]',
	template: `<svg:rect
			x="3"
			y="11"
			width="18"
			height="11"
			rx="2"
			ry="2"
		/>
		<svg:path d="M7 11V7a5 5 0 0 1 10 0v4" />`,
})
export class LockIcon {}
