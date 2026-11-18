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
import { hosted, provideC15t } from '@c15t/angular';

import { scripts } from '../scripts';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter(routes),
		provideClientHydration(withEventReplay()),
		provideC15t({
			mode: hosted(),
			// The consent route server.ts mounts.
			projectUrl: '/api/c15t',
			scripts,
		}),
	],
};
// #endregion docs:ssr-app-config
