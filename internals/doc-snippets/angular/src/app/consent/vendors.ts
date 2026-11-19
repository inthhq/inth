// #region docs:vendors
import type { InthOptions } from '@inth/angular';

// Pass as `vendors` to provideInth() in app.config.ts.
export const vendors: NonNullable<InthOptions['vendors']> = [
	{
		category: 'marketing',
		id: 'x-pixel',
		name: 'X Pixel',
		privacyPolicyUrl: 'https://x.com/privacy',
	},
];
// #endregion docs:vendors
