// #region docs:network-blocker
import type { NetworkBlockerOptions } from '@inth/angular';

// Pass as `networkBlocker` to provideInth() in app.config.ts.
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
