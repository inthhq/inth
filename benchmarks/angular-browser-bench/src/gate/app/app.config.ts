import {
	provideBrowserGlobalErrorListeners,
	provideZonelessChangeDetection,
} from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import {
	provideClientHydration,
	withEventReplay,
} from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { gateConsentCategories } from '@inth/benchmarking/consent-gate-page';
import { hosted, provideInth } from '@inth/angular';

import { scripts } from '../scripts';
import { routes } from './app.routes';

/** The rendering guide's `app.config.ts`, with the gate's categories. */
export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter(routes),
		provideClientHydration(withEventReplay()),
		provideInth({
			consentCategories: [...gateConsentCategories],
			mode: hosted(),
			// The consent route server.ts mounts.
			projectUrl: '/api/inth',
			scripts,
		}),
	],
};
