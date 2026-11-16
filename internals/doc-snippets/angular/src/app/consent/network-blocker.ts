// #region docs:network-blocker
import type { NetworkBlockerOptions } from '@c15t/angular';

// Pass as `networkBlocker` to provideC15t() in app.config.ts.
export const networkBlocker: NetworkBlockerOptions = {
	onRequestBlocked: ({ method, url }) => {
		console.info('Blocked until consent', method, url);
	},
	rules: [
		{
			category: 'measurement',
			domain: 'google-analytics.com',
			id: 'google-analytics',
		},
		{
			category: 'marketing',
			domain: 'connect.facebook.net',
			id: 'meta-pixel',
			pathIncludes: '/signals',
		},
	],
};
// #endregion docs:network-blocker
