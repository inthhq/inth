import { provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import {
	provideClientHydration,
	withEventReplay,
} from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { hosted, provideC15t } from '@c15t/angular';
import { posthog } from '@c15t/integrations/posthog';

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideRouter([]),
		provideClientHydration(withEventReplay()),
		provideC15t({
			// The consent route `server.ts` mounts.
			mode: hosted({ backendURL: '/api/c15t' }),
			// A script in a consent category, so Accept saves a category
			// choice rather than only dismissing a notice.
			scripts: [
				posthog({
					id: 'phc_your_project_key',
					initOptions: { cookieless_mode: 'never' },
					loadMode: 'after-consent',
				}),
			],
		}),
	],
};
