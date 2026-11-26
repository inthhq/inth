/**
 * The adapter modules this SDK ships, each imported on demand. Pass
 * `importAdapter` to `withAdapters`, so a page downloads an adapter only
 * when a manifest names it.
 */
import type { AdapterId, ManifestAdapter } from '../adapter';

const ADAPTER_MODULES: Record<
	AdapterId,
	() => Promise<ManifestAdapter<never>>
> = {
	activecampaign: async () =>
		(await import('./activecampaign')).activeCampaignAdapter,
	ada: async () => (await import('./ada')).adaAdapter,
	'adobe-target': async () =>
		(await import('./adobe-target')).adobeTargetAdapter,
	'amazon-ads': async () => (await import('./amazon-ads')).amazonAdsAdapter,
	'cloudflare-zaraz': async () =>
		(await import('./cloudflare-zaraz')).cloudflareZarazAdapter,
	databuddy: async () => (await import('./databuddy')).databuddyAdapter,
	'default-com': async () => (await import('./default-com')).defaultComAdapter,
	fullstory: async () => (await import('./fullstory')).fullStoryAdapter,
	'gainsight-px': async () =>
		(await import('./gainsight-px')).gainsightPxAdapter,
	gorgias: async () => (await import('./gorgias')).gorgiasAdapter,
	hubspot: async () => (await import('./hubspot')).hubspotAdapter,
	'lucky-orange': async () =>
		(await import('./lucky-orange')).luckyOrangeAdapter,
	'oracle-eloqua': async () => (await import('./oracle-eloqua')).eloquaAdapter,
	'salesforce-pardot': async () =>
		(await import('./salesforce-pardot')).pardotAdapter,
	sentry: async () => (await import('./sentry')).sentryAdapter,
	zendesk: async () => (await import('./zendesk')).zendeskAdapter,
};

/** Imports the adapter module for `id`. */
export const importAdapter = (id: AdapterId): Promise<ManifestAdapter<never>> =>
	ADAPTER_MODULES[id]();
