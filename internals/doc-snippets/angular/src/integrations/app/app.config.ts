// #region docs:integration-register title="src/app/app.config.ts"
import { provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { hosted, provideC15t } from '@c15t/angular';

import { scripts } from '../consent-scripts';

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideC15t({
			// Keep the mode and other options from your quickstart.
			backendURL: 'https://your-project.inth.app',
			mode: hosted(),
			scripts,
		}),
	],
};
// #endregion docs:integration-register
