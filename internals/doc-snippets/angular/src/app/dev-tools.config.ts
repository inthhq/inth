// #region docs:dev-tools-provider title="src/app/app.config.ts"
import { isDevMode, provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { hosted, provideC15t } from '@inth/angular';
import { provideC15tDevTools } from '@inth/angular/devtools';

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideC15t({
			mode: hosted(),
			projectUrl: 'https://your-project.inth.app',
		}),
		// After provideC15t(), and only in development builds.
		isDevMode() ? provideC15tDevTools({ position: 'bottom-left' }) : [],
	],
};
// #endregion docs:dev-tools-provider
