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
import { hosted, provideC15t } from '@c15t/angular';
import { gateConsentCategories } from '@c15t/benchmarking/consent-gate-page';

import { scripts } from '../scripts';
import { routes } from './app.routes';

/** The rendering guide's `app.config.ts`, with the gate's categories. */
export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter(routes),
		provideClientHydration(withEventReplay()),
		provideC15t({
			// The consent route server.ts mounts.
			backendURL: '/api/c15t',
			consentCategories: [...gateConsentCategories],
			mode: hosted(),
			scripts,
		}),
	],
};
