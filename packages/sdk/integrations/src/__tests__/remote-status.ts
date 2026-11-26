import type { BuiltInScriptIntegrationKey } from '../registry';

/**
 * Why a registry vendor has no `remote` export yet.
 *
 * - `pending`: a later pull request in the remote-scripts stack converts it.
 *   `pr` is its place in the stack: 8 and 9 need the level 2 runtime, 11 the
 *   level 3 runtime, 12 and 13 an adapter.
 * - `npm-only`: it stays an npm helper on purpose, for `reason`.
 *
 * The PR that adds a vendor's `remote` export deletes its row here.
 */
export type RemoteStatus =
	| { status: 'pending'; pr: 8 | 9 | 11 | 12 | 13 }
	| { status: 'npm-only'; reason: string };

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
	amazonAdsTag: adapter,
	cloudflareZaraz: adapter,
	customerIo: level3,
	databuddy: level2Lifecycle,
	defaultComPixel: adapter,
	dynamicYield: level2Lifecycle,
	eloquaTracking: adapter,
	fullStory: adapter,
	gainsightPx: level3,
	gorgiasChat: level3,
	hubspot: adapter,
	luckyOrange: adapter,
	marketoMunchkin: level2,
	// Classic mode converts with level 2; consent mode needs an adapter (13).
	pardotTracking: level2,
	pendo: level3,
	pirsch: level3,
	sentry: adapterSentry,
	vercelSpeedInsights: level2Lifecycle,
	wisepops: level2,
	zendeskWidget: level3,
} as const satisfies Partial<Record<BuiltInScriptIntegrationKey, RemoteStatus>>;
