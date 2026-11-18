import { posthog } from '@inth/integrations/posthog';
import type { Script } from '@inth/sdk/engine';

export const scripts: Script[] = [
	// PostHog sits in the `measurement` category. With `after-consent`, its
	// script is not requested until the visitor allows Analytics.
	posthog({
		id: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? 'phc_your_project_key',
		initOptions: { cookieless_mode: 'never' },
		loadMode: 'after-consent',
	}),
];
