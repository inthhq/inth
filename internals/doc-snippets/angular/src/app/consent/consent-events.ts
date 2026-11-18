// #region docs:consent-events
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	effect,
	inject,
} from '@angular/core';
import { ConsentManager } from '@inth/angular';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'app-consent-logger',
	template: '',
})
export class ConsentLogger {
	readonly #consent = inject(ConsentManager);

	constructor() {
		// Re-subscribes if the kernel changes, such as when `enabled` toggles.
		effect((onCleanup) => {
			const stop = this.#consent
				.kernel()
				.events.on('choice:recorded', ({ confirmed }) => {
					console.info('Choice recorded for', confirmed);
				});
			onCleanup(stop);
		});

		// For code outside Angular's reactivity, such as a vendor SDK.
		const stop = this.#consent.subscribeToConsentChanges((permissions) => {
			console.info('Permissions changed', permissions);
		});
		inject(DestroyRef).onDestroy(stop);
	}
}
// #endregion docs:consent-events
