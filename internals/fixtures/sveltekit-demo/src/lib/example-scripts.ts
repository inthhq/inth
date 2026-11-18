import { posthog } from '@inth/integrations/posthog';
import { xPixel } from '@inth/integrations/x-pixel';

export const scripts = [
	posthog({
		id: 'phc_your_project_key',
		initOptions: { cookieless_mode: 'never' },
		loadMode: 'after-consent',
		region: 'eu',
	}),
	xPixel({ pixelId: 'your-pixel-id' }),
];
