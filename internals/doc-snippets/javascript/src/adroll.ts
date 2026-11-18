// #region docs:adroll-scripts title="src/consent-scripts.ts"
import { adrollPixel } from '@inth/integrations/adroll';

export const scripts = [
	adrollPixel({ advertiserId: 'ADVERTISER_ID', pixelId: 'PIXEL_ID' }),
];
// #endregion docs:adroll-scripts
