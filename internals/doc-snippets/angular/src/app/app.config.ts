// #region docs:app-config
import {
	provideBrowserGlobalErrorListeners,
	provideZonelessChangeDetection,
} from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { hosted, provideC15t } from '@c15t/angular';

import { scripts } from '../scripts';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter(routes),
		provideC15t({
			mode: hosted(),
			// Replace with the backend URL of your Inth project.
			projectUrl: 'https://your-project.inth.app',
			scripts,
		}),
	],
};
// #endregion docs:app-config
