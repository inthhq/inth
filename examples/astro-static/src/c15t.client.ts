import type { C15tClientOptionsExtension } from '@inth/astro';
import { posthog } from '@inth/integrations/posthog';

export default {
	scripts: [
		posthog({
			id: 'phc_your_project_key',
			initOptions: { cookieless_mode: 'never' },
			loadMode: 'after-consent',
		}),
	],
} satisfies C15tClientOptionsExtension;
