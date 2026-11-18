import { provideZonelessChangeDetection } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import {
	provideClientHydration,
	withEventReplay,
} from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { hosted, provideInth } from '@inth/angular';
import { posthog } from '@inth/integrations/posthog';

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideRouter([]),
		provideClientHydration(withEventReplay()),
		provideInth({
			mode: hosted(),
			// The consent route `server.ts` mounts.
			projectUrl: '/api/inth',
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
