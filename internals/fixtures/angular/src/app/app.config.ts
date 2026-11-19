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
import { hosted, provideInth } from '@inth/angular';
import type { InthProviderOptions } from '@inth/angular';

import { scripts } from '../scripts';
import { routes } from './app.routes';
import { provideExperimentFromURL } from './experiment';

const consent: InthProviderOptions = {
	mode: hosted(),
	// The consent route `server.ts` mounts.
	projectUrl: '/api/inth',
	scripts,
};

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter(routes),
		provideClientHydration(withEventReplay()),
		provideInth(consent),
		// Demo only: `?experiment=1` runs the banner-shape experiment.
		provideExperimentFromURL(consent),
	],
};
