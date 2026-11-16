// #region docs:iab-config title="src/app/app.config.ts"
import { provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { hosted, provideC15t } from '@c15t/angular';

import { scripts } from '../scripts';

// #hide docs
// Stands in for the number IAB Europe assigned to your company.
const registeredCmpId = 0;
// #endhide docs

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideC15t({
			// The CMP ID IAB Europe assigned to your company.
			iab: { cmpId: registeredCmpId },
			mode: hosted({ backendURL: 'https://your-project.inth.app' }),
			scripts,
		}),
	],
};
// #endregion docs:iab-config
