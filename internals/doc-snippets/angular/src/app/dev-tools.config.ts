// #region docs:dev-tools-provider title="src/app/app.config.ts"
import { isDevMode, provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { hosted, provideC15t } from '@c15t/angular';
import { provideC15tDevTools } from '@c15t/angular/devtools';

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideC15t({
			backendURL: 'https://your-project.inth.app',
			mode: hosted(),
		}),
		// After provideC15t(), and only in development builds.
		isDevMode() ? provideC15tDevTools({ position: 'bottom-left' }) : [],
	],
};
// #endregion docs:dev-tools-provider
