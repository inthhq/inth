import type { BuiltInScriptIntegrationKey } from '../registry';

/**
 * Why a registry vendor has no `remote` export yet.
 *
 * - `pending`: a later pull request in the remote-scripts stack converts it.
 *   `pr` is its place in the stack: 6 converts vendors that are already pure
 *   manifests, 8 and 9 need the level 2 runtime, 11 the level 3 runtime,
 *   12 and 13 an adapter.
 * - `npm-only`: it stays an npm helper on purpose, for `reason`.
 *
 * The PR that adds a vendor's `remote` export deletes its row here.
 */
export type RemoteStatus =
	| { status: 'pending'; pr: 6 | 8 | 9 | 11 | 12 | 13 }
	| { status: 'npm-only'; reason: string };

const batchB = { pr: 6, status: 'pending' } as const;
const level2 = { pr: 8, status: 'pending' } as const;
const level2Lifecycle = { pr: 9, status: 'pending' } as const;
const level3 = { pr: 11, status: 'pending' } as const;
const adapterSentry = { pr: 12, status: 'pending' } as const;
const adapter = { pr: 13, status: 'pending' } as const;

/** Every registry key without a `remote` export, and why. */
export const remoteStatus = {
	activeCampaignTracking: adapter,
	ada: adapter,
	// The Web SDK mode needs an adapter; at.js loads from a fixed Adobe host.
	adobeTarget: adapter,
	adrollPixel: level2,
	amazonAdsTag: adapter,
	appcues: level2,
	attentiveTag: batchB,
	// The helper loads Clay in the body; a manifest sets `target` from level 2.
	clay: level2,
	cloudflareZaraz: adapter,
	crisp: batchB,
	customerIo: level3,
	databuddy: level2Lifecycle,
	defaultComPixel: adapter,
	dynamicYield: level2Lifecycle,
	eloquaTracking: adapter,
	frontChat: level2,
	fullStory: adapter,
	gainsightPx: level3,
	gorgiasChat: level3,
	hubspot: adapter,
	insiderTag: batchB,
	intercom: batchB,
	klaviyo: batchB,
	luckyOrange: adapter,
	marketoMunchkin: level2,
	optimizelyWeb: batchB,
	// Classic mode converts with level 2; consent mode needs an adapter (13).
	pardotTracking: level2,
	pendo: level3,
	pirsch: level3,
	rudderstack: {
		reason:
			"needs the account's data plane URL, and no option kind takes a URL; a hostname option for it would need the same sign-off Pardot's has",
		status: 'npm-only',
	},
	sentry: adapterSentry,
	vercelSpeedInsights: level2Lifecycle,
	wisepops: level2,
	zendeskWidget: level3,
} as const satisfies Partial<Record<BuiltInScriptIntegrationKey, RemoteStatus>>;
