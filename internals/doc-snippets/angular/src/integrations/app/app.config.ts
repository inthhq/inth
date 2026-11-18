// #region docs:integration-register title="src/app/app.config.ts"
import { provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { hosted, provideInth } from '@inth/angular';

import { scripts } from '../consent-scripts';

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideInth({
			// Keep the mode and other options from your quickstart.
			mode: hosted(),
			projectUrl: 'https://your-project.inth.app',
			scripts,
		}),
	],
};
// #endregion docs:integration-register
