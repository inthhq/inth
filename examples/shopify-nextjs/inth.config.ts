// #region docs:shopify-config
import { defineConsentConfig } from '@inth/nextjs';

export default defineConsentConfig({
	options: {
		// The categories the Shopify bridge maps. Shopify's scripts load through
		// Hydrogen's `ShopifyScripts`, not `scripts`, so Inth can't discover them.
		consentCategories: ['measurement', 'marketing', 'functionality'],
	},
});
// #endregion docs:shopify-config
