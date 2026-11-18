// #region docs:insider-scripts title="src/consent-scripts.ts"
import { insiderTag } from '@inth/integrations/insider';

export const scripts = [
	insiderTag({
		currency: 'GBP',
		pageType: {
			type: 'category',
			value: { breadcrumb: ['Clothing', 'Dresses'] },
		},
		partnerId: 'YOUR_PARTNER_ID',
		partnerName: 'yourpartner',
	}),
];
// #endregion docs:insider-scripts
