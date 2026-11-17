import { isPlatformBrowser } from '@angular/common';
import { Directive, effect, inject, PLATFORM_ID } from '@angular/core';
import { ConsentManager } from '@c15t/angular';
import { updateGateBridge } from '@c15t/benchmarking/consent-gate-page';

/**
 * Publishes the consent snapshot to the gate bridge whenever it changes, as
 * the other gate pages do from their snapshot hook.
 */
@Directive({ selector: 'gate-bridge' })
export class GateBridge {
	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const consent = inject(ConsentManager);
		effect(() => {
			updateGateBridge(consent.snapshot());
		});
	}
}
