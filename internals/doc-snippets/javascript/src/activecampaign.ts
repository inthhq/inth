// #region docs:activecampaign-configuration title="src/consent-scripts.ts"
import { activeCampaignTracking } from '@inth/integrations/activecampaign';

export const scripts = [
	activeCampaignTracking({ accountId: 'YOUR_ACCOUNT_ID' }),
];
// #endregion docs:activecampaign-configuration
