import { ChangeDetectionStrategy, Component } from '@angular/core';

import { STROKE_HOST } from './stroke-host';

/** Stacked layers. @internal */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: STROKE_HOST,
	selector: 'svg[inth-layers-icon]',
	template: `<svg:path d="M12 2L2 7l10 5 10-5-10-5z" />
		<svg:path d="M2 17l10 5 10-5" />
		<svg:path d="M2 12l10 5 10-5" />`,
})
export class LayersIcon {}
