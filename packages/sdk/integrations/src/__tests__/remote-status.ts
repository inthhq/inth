import type { BuiltInScriptIntegrationKey } from '../registry';

/**
 * Why a registry vendor has no `remote` export yet.
 *
 * - `pending`: a later pull request in the remote-scripts stack converts it.
 *   `pr` is its place in the stack: 13 needs an adapter. The level 2 (8, 9),
 *   level 3 (11) and Sentry adapter (12) batches left none pending.
 * - `npm-only`: it stays an npm helper on purpose, for `reason`.
 *
 * The PR that adds a vendor's `remote` export deletes its row here.
 */
export type RemoteStatus =
	| { status: 'pending'; pr: 13 }
	| { status: 'npm-only'; reason: string };

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
	// Before init() resolves, the chat's API is a Proxy that throws on every
	// read but init, also on the Symbol.toStringTag read the manifest
	// runtime makes to tell a vendor object from a browser one. The runtime
	// reads a throw as a browser object and skips GorgiasChat.init(), so a
	// manifest never reaches the init() path (gorgias.test.ts, "waits for the
	// real loader proxy contract").
	gorgiasChat: adapter,
	hubspot: adapter,
	// The helper points zE.s at the loader's element on every grant, also when
	// zE is already a function (the stub of an earlier grant, or the loaded
	// API on a remount). setGlobalPath walks only object-valued path segments
	// and defineStubFunction sets properties only on a stub it creates, so a
	// manifest cannot express it (zendesk.e2e.test.ts re-grant and remount rows).
	zendeskWidget: adapter,
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
export const remoteOptionStatus = {} as const satisfies Partial<
	Record<BuiltInScriptIntegrationKey, Record<string, RemoteStatus>>
>;
