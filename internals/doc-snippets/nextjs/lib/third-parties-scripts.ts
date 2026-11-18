// #region docs:third-parties-scripts title="lib/scripts.ts"
import { gtag } from '@inth/integrations/google-tag';
import { googleTagManager } from '@inth/integrations/google-tag-manager';
import type { Script } from '@inth/nextjs';

export const scripts: Script[] = [
	// Replaces <GoogleAnalytics gaId="G-XXXXXXXXXX" />
	gtag({ category: 'measurement', id: 'G-XXXXXXXXXX' }),
	// Replaces <GoogleTagManager gtmId="GTM-XXXXXXX" />
	googleTagManager({ id: 'GTM-XXXXXXX' }),
];
// #endregion docs:third-parties-scripts
