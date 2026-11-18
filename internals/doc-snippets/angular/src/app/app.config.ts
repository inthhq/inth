// #region docs:app-config
import {
	provideBrowserGlobalErrorListeners,
	provideZonelessChangeDetection,
} from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { hosted, provideInth } from '@inth/angular';

import { scripts } from '../scripts';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter(routes),
		provideInth({
			mode: hosted(),
			// Replace with the backend URL of your Inth project.
			projectUrl: 'https://your-project.inth.app',
			scripts,
		}),
	],
};
// #endregion docs:app-config
