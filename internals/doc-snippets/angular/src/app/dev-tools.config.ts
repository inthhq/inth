// #region docs:dev-tools-provider title="src/app/app.config.ts"
import { isDevMode, provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { hosted, provideInth } from '@inth/angular';
import { provideInthDevTools } from '@inth/angular/devtools';

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideInth({
			mode: hosted(),
			projectUrl: 'https://your-project.inth.app',
		}),
		// After provideInth(), and only in development builds.
		isDevMode() ? provideInthDevTools({ position: 'bottom-left' }) : [],
	],
};
// #endregion docs:dev-tools-provider
