// #region docs:vendors
import type { C15tOptions } from '@inth/angular';

// Pass as `vendors` to provideC15t() in app.config.ts.
export const vendors: NonNullable<C15tOptions['vendors']> = [
	{
		category: 'marketing',
		id: 'x-pixel',
		name: 'X Pixel',
		privacyPolicyUrl: 'https://x.com/privacy',
	},
];
// #endregion docs:vendors
