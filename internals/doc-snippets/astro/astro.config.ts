import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import inth from '@inth/astro';
import { testing } from '@inth/astro/testing';
import { defineConfig } from 'astro/config';

export default defineConfig({
	adapter: node({ mode: 'standalone' }),
	integrations: [
		svelte(),
		inth({
			mode: testing(),
			// #region docs:vendors-option title="astro.config.mjs (partial)"
			vendors: [
				{
					category: 'measurement',
					description: 'Product analytics and session insights.',
					id: 'posthog',
					name: 'PostHog',
					privacyPolicyUrl: 'https://posthog.com/privacy',
				},
				{
					category: 'measurement',
					description: 'Embedded videos.',
					id: 'youtube',
					name: 'YouTube',
					privacyPolicyUrl: 'https://policies.google.com/privacy',
				},
				{
					category: 'marketing',
					description: 'Ad conversion tracking.',
					id: 'x-pixel',
					name: 'X Pixel',
					privacyPolicyUrl: 'https://x.com/en/privacy',
				},
			],
			// #endregion docs:vendors-option
		}),
	],
	output: 'server',
});
