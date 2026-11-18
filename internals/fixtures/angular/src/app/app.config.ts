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
import type { C15tProviderOptions } from '@c15t/angular';

import { scripts } from '../scripts';
import { routes } from './app.routes';
import { provideExperimentFromURL } from './experiment';

const consent: C15tProviderOptions = {
	// The consent route `server.ts` mounts.
	backendURL: '/api/c15t',
	mode: hosted(),
	scripts,
};

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter(routes),
		provideClientHydration(withEventReplay()),
		provideC15t(consent),
		// Demo only: `?experiment=1` runs the banner-shape experiment.
		provideExperimentFromURL(consent),
	],
};
