import { builtInScriptIntegrations } from './registry';
import type { BuiltInScriptIntegrationKey } from './registry';
import type { RemoteDefinition } from './remote-define';
import * as adrollModule from './vendors/ads-and-pixels/adroll';
import * as amazonAdsModule from './vendors/ads-and-pixels/amazon-ads';
import * as linkedinInsightsModule from './vendors/ads-and-pixels/linkedin-insights';
import * as liveintentModule from './vendors/ads-and-pixels/liveintent';
import * as metaPixelModule from './vendors/ads-and-pixels/meta-pixel';
import * as microsoftUetModule from './vendors/ads-and-pixels/microsoft-uet';
import * as openaiPixelModule from './vendors/ads-and-pixels/openai-pixel';
import * as pinterestTagModule from './vendors/ads-and-pixels/pinterest-tag';
import * as redditPixelModule from './vendors/ads-and-pixels/reddit-pixel';
import * as snapchatPixelModule from './vendors/ads-and-pixels/snapchat-pixel';
import * as theTradeDeskModule from './vendors/ads-and-pixels/the-trade-desk';
import * as tiktokPixelModule from './vendors/ads-and-pixels/tiktok-pixel';
import * as vectorModule from './vendors/ads-and-pixels/vector';
import * as xPixelModule from './vendors/ads-and-pixels/x-pixel';
import * as adobeAnalyticsModule from './vendors/analytics/adobe-analytics';
import * as ahrefsAnalyticsModule from './vendors/analytics/ahrefs-analytics';
import * as amplitudeModule from './vendors/analytics/amplitude';
import * as clayModule from './vendors/analytics/clay';
import * as clearbitModule from './vendors/analytics/clearbit';
import * as cloudflareWebAnalyticsModule from './vendors/analytics/cloudflare-web-analytics';
import * as databuddyModule from './vendors/analytics/databuddy';
import * as defaultComModule from './vendors/analytics/default-com';
import * as fathomAnalyticsModule from './vendors/analytics/fathom-analytics';
import * as fullstoryModule from './vendors/analytics/fullstory';
import * as gainsightPxModule from './vendors/analytics/gainsight-px';
import * as googleTagModule from './vendors/analytics/google-tag';
import * as heapModule from './vendors/analytics/heap';
import * as hightouchModule from './vendors/analytics/hightouch';
import * as hotjarModule from './vendors/analytics/hotjar';
import * as hubspotModule from './vendors/analytics/hubspot';
import * as logrocketModule from './vendors/analytics/logrocket';
import * as luckyOrangeModule from './vendors/analytics/lucky-orange';
import * as marketoModule from './vendors/analytics/marketo';
import * as matomoAnalyticsModule from './vendors/analytics/matomo-analytics';
import * as microsoftClarityModule from './vendors/analytics/microsoft-clarity';
import * as mixpanelAnalyticsModule from './vendors/analytics/mixpanel-analytics';
import * as oneDollarStatsModule from './vendors/analytics/one-dollar-stats';
import * as oracleEloquaModule from './vendors/analytics/oracle-eloqua';
import * as pendoModule from './vendors/analytics/pendo';
import * as pirschModule from './vendors/analytics/pirsch';
import * as plausibleAnalyticsModule from './vendors/analytics/plausible-analytics';
import * as posthogModule from './vendors/analytics/posthog';
import * as promptwatchModule from './vendors/analytics/promptwatch';
import * as rb2bModule from './vendors/analytics/rb2b';
import * as rudderstackModule from './vendors/analytics/rudderstack';
import * as rybbitAnalyticsModule from './vendors/analytics/rybbit-analytics';
import * as salesforcePardotModule from './vendors/analytics/salesforce-pardot';
import * as segmentModule from './vendors/analytics/segment';
import * as sentryModule from './vendors/analytics/sentry';
import * as statableAnalyticsModule from './vendors/analytics/statable-analytics';
import * as umamiAnalyticsModule from './vendors/analytics/umami-analytics';
import * as vercelAnalyticsModule from './vendors/analytics/vercel-analytics';
import * as vercelSpeedInsightsModule from './vendors/analytics/vercel-speed-insights';
import * as activecampaignModule from './vendors/email-and-sms/activecampaign';
import * as attentiveModule from './vendors/email-and-sms/attentive';
import * as customerIoModule from './vendors/email-and-sms/customer-io';
import * as insiderModule from './vendors/email-and-sms/insider';
import * as klaviyoModule from './vendors/email-and-sms/klaviyo';
import * as adaModule from './vendors/functional/ada';
import * as adobeTargetModule from './vendors/functional/adobe-target';
import * as appcuesModule from './vendors/functional/appcues';
import * as crispModule from './vendors/functional/crisp';
import * as dynamicYieldModule from './vendors/functional/dynamic-yield';
import * as frontChatModule from './vendors/functional/front-chat';
import * as gorgiasModule from './vendors/functional/gorgias';
import * as intercomModule from './vendors/functional/intercom';
import * as optimizelyModule from './vendors/functional/optimizely';
import * as wisepopsModule from './vendors/functional/wisepops';
import * as zendeskModule from './vendors/functional/zendesk';
import * as cloudflareZarazModule from './vendors/tag-managers/cloudflare-zaraz';
import * as googleTagManagerModule from './vendors/tag-managers/google-tag-manager';

/**
 * Every built-in vendor module by registry key. The compiler fails when the
 * registry gains a key this map lacks, so the remote catalogue always walks
 * every vendor.
 */
export const vendorModules = {
	activeCampaignTracking: activecampaignModule,
	ada: adaModule,
	adobeAnalytics: adobeAnalyticsModule,
	adobeTarget: adobeTargetModule,
	adrollPixel: adrollModule,
	ahrefsAnalytics: ahrefsAnalyticsModule,
	amazonAdsTag: amazonAdsModule,
	amplitude: amplitudeModule,
	appcues: appcuesModule,
	attentiveTag: attentiveModule,
	clay: clayModule,
	clearbit: clearbitModule,
	cloudflareWebAnalytics: cloudflareWebAnalyticsModule,
	cloudflareZaraz: cloudflareZarazModule,
	crisp: crispModule,
	customerIo: customerIoModule,
	databuddy: databuddyModule,
	defaultComPixel: defaultComModule,
	dynamicYield: dynamicYieldModule,
	eloquaTracking: oracleEloquaModule,
	fathomAnalytics: fathomAnalyticsModule,
	frontChat: frontChatModule,
	fullStory: fullstoryModule,
	gainsightPx: gainsightPxModule,
	googleTagManager: googleTagManagerModule,
	gorgiasChat: gorgiasModule,
	gtag: googleTagModule,
	heap: heapModule,
	hightouch: hightouchModule,
	hotjar: hotjarModule,
	hubspot: hubspotModule,
	insiderTag: insiderModule,
	intercom: intercomModule,
	klaviyo: klaviyoModule,
	linkedinInsights: linkedinInsightsModule,
	liveIntentTag: liveintentModule,
	logRocket: logrocketModule,
	luckyOrange: luckyOrangeModule,
	marketoMunchkin: marketoModule,
	matomoAnalytics: matomoAnalyticsModule,
	metaPixel: metaPixelModule,
	'microsoft-clarity': microsoftClarityModule,
	microsoftUet: microsoftUetModule,
	mixpanelAnalytics: mixpanelAnalyticsModule,
	oneDollarStats: oneDollarStatsModule,
	openaiPixel: openaiPixelModule,
	optimizelyWeb: optimizelyModule,
	pardotTracking: salesforcePardotModule,
	pendo: pendoModule,
	pinterestTag: pinterestTagModule,
	pirsch: pirschModule,
	plausibleAnalytics: plausibleAnalyticsModule,
	posthog: posthogModule,
	promptwatch: promptwatchModule,
	rb2b: rb2bModule,
	redditPixel: redditPixelModule,
	rudderstack: rudderstackModule,
	rybbitAnalytics: rybbitAnalyticsModule,
	segment: segmentModule,
	sentry: sentryModule,
	snapchatPixel: snapchatPixelModule,
	statableAnalytics: statableAnalyticsModule,
	theTradeDeskPixel: theTradeDeskModule,
	tiktokPixel: tiktokPixelModule,
	umamiAnalytics: umamiAnalyticsModule,
	vector: vectorModule,
	vercelAnalytics: vercelAnalyticsModule,
	vercelSpeedInsights: vercelSpeedInsightsModule,
	wisepops: wisepopsModule,
	xPixel: xPixelModule,
	zendeskWidget: zendeskModule,
} as const satisfies Record<BuiltInScriptIntegrationKey, object>;

/** A vendor's `remote` export, or undefined while it is npm-only. */
export const remoteOf = function remoteOf(
	key: BuiltInScriptIntegrationKey
): RemoteDefinition | undefined {
	const module: object = vendorModules[key];
	return 'remote' in module ? (module.remote as RemoteDefinition) : undefined;
};

/** The `remote` export of every vendor that has one, in registry order. */
export const remoteDefinitions: readonly RemoteDefinition[] =
	builtInScriptIntegrations.flatMap((entry) => {
		const definition = remoteOf(entry.key);
		return definition === undefined ? [] : [definition];
	});
