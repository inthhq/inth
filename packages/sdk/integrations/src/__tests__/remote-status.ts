import type { BuiltInScriptIntegrationKey } from '../registry';

/**
 * Why a registry vendor has no `remote` export yet.
 *
 * - `pending`: a later pull request in the remote-scripts stack converts it.
 *   `pr` is its place in the stack: 11 needs the level 3 runtime, 12 and
 *   13 an adapter.
 * - `npm-only`: it stays an npm helper on purpose, for `reason`.
 *
 * The PR that adds a vendor's `remote` export deletes its row here.
 */
export type RemoteStatus =
	| { status: 'pending'; pr: 11 | 12 | 13 }
	| { status: 'npm-only'; reason: string };

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
	defaultComPixel: adapter,
	// A level 2 manifest cannot express two behaviours its golden trace
	// records. The helper inserts api_static.js without an id, and
	// loadScriptStep always sets one. And when a registration replaces
	// another, the outgoing one's dispose runs after the incoming one has
	// started, so a dispose step that sets userActiveConsent to
	// { accepted: false }, as the helper does on a plain dispose, would
	// leave the incoming, granted registration reading denied.
	dynamicYield: adapter,
	eloquaTracking: adapter,
	fullStory: adapter,
	gainsightPx: level3,
	gorgiasChat: level3,
	hubspot: adapter,
	luckyOrange: adapter,
	pendo: level3,
	sentry: adapterSentry,
	zendeskWidget: level3,
} as const satisfies Partial<Record<BuiltInScriptIntegrationKey, RemoteStatus>>;

/**
 * Modes of a remote vendor that its remote definition leaves out, by
 * registry key, then by the value of its `mode` option, and why. The remote
 * definition's `mode` enum must not offer them.
 */
export const remoteModeStatus = {
	pardotTracking: {
		// Consent mode grants once per consent cycle after its SDK loads, and
		// replays saved configuration when a disposed download runs late.
		consent: adapter,
	},
} as const satisfies Partial<
	Record<BuiltInScriptIntegrationKey, Record<string, RemoteStatus>>
>;

/**
 * Options of a remote vendor that its remote definition leaves out until a
 * later pull request, by registry key, and why. The remote definition must
 * not declare them.
 */
export const remoteOptionStatus = {
	databuddy: {
		// Session replay's golden trace records a replay.js tag without an id,
		// and loadScriptStep always sets one. The helper also shares one script
		// across rerenders with equal options; a fresh registration disposes
		// the old one, which stops the recorder, and the new one skips
		// replay.js because databuddyReplay is still defined.
		replay: adapter,
	},
} as const satisfies Partial<
	Record<BuiltInScriptIntegrationKey, Record<string, RemoteStatus>>
>;
