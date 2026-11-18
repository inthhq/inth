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
	mode: hosted(),
	// The consent route `server.ts` mounts.
	projectUrl: '/api/c15t',
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
