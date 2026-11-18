import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
} from '@angular/core';
import { ConsentManager } from '@inth/angular';

import { ExperimentLog } from './experiment';

/**
 * Demo only: the assigned arm and the events logged under it. The page
 * renders it only for `?experiment=1`.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'app-experiment-readout',
	template: `
		<section
			class="card"
			data-testid="experiment"
		>
			<h2>Banner experiment</h2>
			<p>
				Arm: <code data-testid="experiment-arm">{{ arm() }}</code>
			</p>
			<ul class="statuses">
				@for (event of log.events(); track $index) {
					<li>
						<code>{{ event.name }}</code> · {{ event.arm }} ·
						{{ event.detail }}
					</li>
				}
			</ul>
			<p>The same events are pushed to <code>window.dataLayer</code>.</p>
		</section>
	`,
})
export class ExperimentReadout {
	readonly #consent = inject(ConsentManager);
	protected readonly log = inject(ExperimentLog);

	protected readonly arm = computed(() => {
		const experiment = this.#consent.experiment();
		return experiment
			? `${experiment.id} · ${experiment.arm} · ${experiment.assignedBy}`
			: 'assigning…';
	});
}
