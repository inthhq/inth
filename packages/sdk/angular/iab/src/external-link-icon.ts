import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** An external-link arrow. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-external-link-icon]',
	template: `<svg:path
			d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
		/>
		<svg:polyline points="15 3 21 3 21 9" />
		<svg:line
			x1="10"
			y1="14"
			x2="21"
			y2="3"
		/>`,
})
export class ExternalLinkIcon {}
