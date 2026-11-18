// #region docs:nuxt-scripts-registry title="app/consent-scripts.ts"
import { gtag } from '@inth/integrations/google-tag';
import { googleTagManager } from '@inth/integrations/google-tag-manager';
import { metaPixel } from '@inth/integrations/meta-pixel';

export const scripts = [
	// Was useScriptGoogleAnalytics({ id: 'G-XXXXXXXXXX' })
	gtag({ category: 'measurement', id: 'G-XXXXXXXXXX' }),
	// Was useScriptGoogleTagManager({ id: 'GTM-XXXXXXX' })
	googleTagManager({ id: 'GTM-XXXXXXX' }),
	// Was useScriptMetaPixel({ id: '123456789012345' })
	metaPixel({ pixelId: '123456789012345' }),
];
// #endregion docs:nuxt-scripts-registry
