// #region docs:ssr-app-config title="src/app/app.config.ts"
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

import { scripts } from '../scripts';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter(routes),
		provideClientHydration(withEventReplay()),
		provideInth({
			mode: hosted(),
			// The consent route server.ts mounts.
			projectUrl: '/api/inth',
			scripts,
		}),
	],
};
// #endregion docs:ssr-app-config
