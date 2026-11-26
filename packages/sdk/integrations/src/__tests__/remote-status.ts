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
	// A level 2 manifest cannot express two behaviours its golden trace
	// records. The helper inserts api_static.js without an id, and
	// loadScriptStep always sets one. And when a registration replaces
	// another, the outgoing one's dispose runs after the incoming one has
	// started, so a dispose step that sets userActiveConsent to
	// { accepted: false }, as the helper does on a plain dispose, would
	// leave the incoming, granted registration reading denied.
	dynamicYield: adapter,
} as const satisfies Partial<Record<BuiltInScriptIntegrationKey, RemoteStatus>>;

/**
 * Modes of a remote vendor that its remote definition leaves out, by
 * registry key, then by the value of its `mode` option, and why. The remote
 * definition's `mode` enum must not offer them.
 */
export const remoteModeStatus = {
	adobeTarget: {
		// Adobe hosts no shared at.js file: a site downloads at.js from Target
		// and hosts it, which the npm helper's scriptUrl takes. A remote form
		// needs a fixed Adobe host with a path built from validated IDs.
		atjs: adapter,
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
