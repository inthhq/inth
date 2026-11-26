import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { isHostname } from '../_shared/hostname';
import { readId, skipMissingId, skipScript } from '../_shared/required-id';
import {
	httpsScriptUrl,
	isHttpsUrl,
	withScriptUrl,
} from '../_shared/script-url';

export const RUDDERSTACK_QUEUE_METHODS = [
	'setDefaultInstanceKey',
	'load',
	'ready',
	'page',
	'track',
	'identify',
	'alias',
	'group',
	'reset',
	'setAnonymousId',
	'startSession',
	'endSession',
	'consent',
	'addCustomIntegration',
] as const;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

/**
 * JSON-serializable object passed to RudderStack's `load()` API.
 */
export interface JsonObject {
	[key: string]: JsonValue;
}

/**
 * RudderStack JavaScript SDK `load()` options.
 *
 * The options are interpolated into a script manifest and passed as the third
 * `rudderanalytics.load(writeKey, dataPlaneUrl, options)` argument. Keep values
 * JSON-serializable: plain objects, arrays, strings, numbers, booleans, and
 * `null`. Functions, class instances, Dates, Maps, Sets, and symbols are not
 * supported.
 */
export type RudderStackLoadOptions = JsonObject;

/**
 * Public RudderStack JavaScript SDK API exposed on `window.rudderanalytics`.
 *
 * The official v3 CDN snippet starts as an array-backed queue and the loaded
 * SDK replaces it with an initialized runtime object. Use this interface for
 * calls made after consent has allowed the SDK to load.
 *
 * @example
 * ```ts
 * window.rudderanalytics?.track('Signup Completed', { plan: 'pro' });
 * ```
 */
export interface RudderStackApi {
	/**
	 * Sets the default instance key for multi-instance setups.
	 *
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	setDefaultInstanceKey: (key: string) => unknown;
	/**
	 * Loads and initializes the RudderStack JavaScript SDK.
	 *
	 * @param dataPlaneUrl - HTTPS data plane URL for the source.
	 * @param options - Optional JSON-serializable load options.
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	load: (
		writeKey: string,
		dataPlaneUrl: string,
		options?: RudderStackLoadOptions
	) => unknown;
	/**
	 * Registers a callback that fires when the SDK is ready.
	 *
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	ready: (callback: () => void) => unknown;
	/**
	 * Tracks a page view with optional category, name, properties, and options.
	 *
	 * @param options - Optional event context or integrations options.
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	page: (
		category?: string,
		name?: string,
		properties?: Record<string, unknown>,
		options?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Tracks a named event.
	 *
	 * @param options - Optional event context or integrations options.
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	track: (
		event: string,
		properties?: Record<string, unknown>,
		options?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Identifies a user and associates traits with that identity.
	 *
	 * @param options - Optional event context or integrations options.
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	identify: (
		userId: string,
		traits?: Record<string, unknown>,
		options?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Aliases one user identifier to another.
	 *
	 * @param userId - New canonical user identifier.
	 * @param previousId - Optional previous identifier.
	 * @param options - Optional event context or integrations options.
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	alias: (
		userId: string,
		previousId?: string,
		options?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Associates the current user with a group or account.
	 *
	 * @param options - Optional event context or integrations options.
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	group: (
		groupId: string,
		traits?: Record<string, unknown>,
		options?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Clears the current user identity state.
	 *
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	reset: () => unknown;
	/**
	 * Sets the anonymous ID used for subsequent events.
	 *
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	setAnonymousId: (anonymousId: string) => unknown;
	/**
	 * Starts a session with an optional session identifier.
	 *
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	startSession: (sessionId?: string) => unknown;
	/**
	 * Ends the current session.
	 *
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	endSession: () => unknown;
	/**
	 * Transitions the SDK from pre-consent to post-consent behavior.
	 *
	 * @param consentOptions - Vendor-supported consent options.
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 *
	 * @remarks
	 * This API is for RudderStack's consent-management flow. In the default
	 * (blocked-load) mode it is not an Inth revocation hook; Inth unloads the
	 * SDK when measurement consent is revoked. In the opt-in pre-consent mode
	 * (`consentManagement` option) Inth calls it with the mapped consent IDs on
	 * every consent decision and change.
	 */
	consent: (consentOptions?: Record<string, unknown>) => unknown;
	/**
	 * Registers a custom device-mode integration. RudderStack only accepts
	 * registrations made before `load()` completes, which is why this is part
	 * of the pre-load queue.
	 *
	 * @returns The RudderStack runtime or a promise-like value from the SDK.
	 */
	addCustomIntegration: (name: string, integration: unknown) => unknown;
}

declare global {
	interface Window {
		rudderanalytics?: RudderStackApi;
		rudderAnalyticsBuildType?: string;
		RudderSnippetVersion?: string;
	}
}

/**
 * RudderStack vendor manifest.
 *
 * Creates RudderStack's v3 `window.rudderanalytics` queue, marks the snippet as
 * seeded, queues the required `load()` call and optional `page()` call, then
 * lets Inth own the script element.
 */
export const rudderstackManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			ifUndefined: true,

			name: 'rudderanalytics',
			type: 'setGlobal',
			value: [],
		},
		{
			name: 'RudderSnippetVersion',
			type: 'setGlobal',
			value: '3.0.32',
		},
		{
			name: 'rudderAnalyticsBuildType',
			type: 'setGlobal',
			value: 'modern',
		},
		{
			path: ['rudderanalytics', 'snippetExecuted'],
			type: 'setGlobalPath',
			value: true,
		},
		{
			methods: [...RUDDERSTACK_QUEUE_METHODS],

			target: 'rudderanalytics',
			type: 'defineQueueMethods',
		},
	],
	category: 'measurement',
	install: [
		{
			args: ['{{writeKey}}', '{{dataPlaneUrl}}', '{{loadOptions}}'],

			global: 'rudderanalytics',
			method: 'load',
			type: 'callGlobal',
		},
		{
			global: 'rudderanalytics',
			method: 'page',

			type: 'callGlobal',
		},
		{
			async: true,
			attributes: {
				'data-loader': 'RS_JS_SDK',
				'data-rsa-write-key': '{{writeKey}}',
			},

			src: 'https://cdn.rudderlabs.com/v3/modern/rsa.min.js',
			type: 'loadScript',
		},
	],
	vendor: 'rudderstack',
	vendorDetails: {
		homepageUrl: 'https://www.rudderstack.com/',
		legalName: 'RudderStack, Inc.',
		name: 'RudderStack',
		privacyPolicyUrl: 'https://www.rudderstack.com/privacy-policy/',
	},
} as const satisfies VendorManifest;

/**
 * Inth consent categories accepted by the RudderStack consent mapping.
 */
export type RudderStackConsentCategory =
	| 'necessary'
	| 'functionality'
	| 'experience'
	| 'measurement'
	| 'marketing';

/**
 * Opt-in pre-consent mode configuration.
 *
 * When provided, the SDK loads immediately for every visitor in RudderStack's
 * pre-consent state (no persistent storage, events buffered in memory) and
 * Inth signals consent decisions through `rudderanalytics.consent()` with the
 * mapped consent IDs. This preserves pre-consent event attribution for users
 * who go on to consent, at the cost of running vendor code before consent.
 *
 * Every destination in your RudderStack workspace must carry the consent IDs
 * used here — Inth cannot verify that configuration from the browser, which is
 * why this mode is opt-in and blocking the load stays the default.
 */
export interface RudderStackConsentManagementOptions {
	/**
	 * Inth consent category → RudderStack consent IDs.
	 *
	 * IDs come from your RudderStack destination consent settings. Categories
	 * granted in Inth contribute their IDs to `allowedConsentIds`; everything
	 * else lands in `deniedConsentIds`.
	 *
	 * @example
	 * ```ts
	 * {
	 *   measurement: ['product-analytics'],
	 *   marketing: ['ad-destinations'],
	 * }
	 * ```
	 */
	mapping: Partial<Record<RudderStackConsentCategory, string[]>>;
}

/** The data plane as a full URL. */
export interface RudderStackDataPlaneUrl {
	/**
	 * RudderStack HTTPS data plane URL. Wins over `dataPlaneHost`.
	 */
	dataPlaneUrl: string;
	dataPlaneHost?: string;
}

/** The data plane as a hostname, served over HTTPS at its root. */
export interface RudderStackDataPlaneHost {
	dataPlaneUrl?: undefined;
	/**
	 * Hostname of the RudderStack data plane, such as
	 * `example.dataplane.rudderstack.com`, with no scheme, port or path. The
	 * SDK sends events to `https://<dataPlaneHost>`.
	 */
	dataPlaneHost: string;
}

/**
 * RudderStack options: the data plane as a URL or as a hostname. When both
 * are set, `dataPlaneUrl` wins.
 */
export type RudderStackOptions = RudderStackSourceOptions &
	(RudderStackDataPlaneUrl | RudderStackDataPlaneHost);

/** The source and how the SDK loads. */
export interface RudderStackSourceOptions {
	/**
	 * RudderStack source write key.
	 */
	writeKey: string;

	/**
	 * Opt into RudderStack's pre-consent mode with Inth as the consent
	 * provider instead of blocking the SDK load until consent.
	 *
	 * Defaults to `undefined`, which keeps the safe default: the SDK does not
	 * load until `measurement` consent is granted. See
	 * {@link RudderStackConsentManagementOptions} for the tradeoffs.
	 */
	consentManagement?: RudderStackConsentManagementOptions;

	/**
	 * Optional JSON-serializable RudderStack `load()` options.
	 *
	 * Values must be JSON-serializable because Inth resolves the manifest into
	 * script lifecycle callbacks. Do not pass functions, Dates, Maps, Sets,
	 * class instances, symbols, or other non-JSON values.
	 */
	loadOptions?: RudderStackLoadOptions;

	/**
	 * Queue the initial `rudderanalytics.page()` call during setup.
	 *
	 * @default true
	 */
	trackPageView?: boolean;

	/**
	 * Optional full loader URL override.
	 *
	 * @default 'https://cdn.rudderlabs.com/v3/modern/rsa.min.js'
	 */
	scriptUrl?: string;
}

const skippedRudderstackScript = {
	category: 'measurement',
	manifest: rudderstackManifest,
} as const;

const isJsonObjectValue = function isJsonObjectValue(
	value: unknown
): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const validateConsentMapping = function validateConsentMapping(
	consentManagement: RudderStackConsentManagementOptions
): Record<string, string[]> {
	const normalized: Record<string, string[]> = {};

	for (const [category, ids] of Object.entries(consentManagement.mapping)) {
		if (!Array.isArray(ids)) {
			throw new Error(
				`rudderstack: consentManagement.mapping.${category} must be an array of consent IDs`
			);
		}

		const trimmed = ids
			.map((id) => {
				if (typeof id === 'string') {
					return id.trim();
				}
				return '';
			})
			.filter((id) => id.length > 0);

		// A declared category with no usable IDs would silently leave its
		// destinations receiving events regardless of consent — reject loudly.
		if (trimmed.length === 0) {
			throw new Error(
				`rudderstack: consentManagement.mapping.${category} is declared but contains no valid consent IDs`
			);
		}

		normalized[category] = trimmed;
	}

	if (Object.keys(normalized).length === 0) {
		throw new Error(
			'rudderstack: consentManagement.mapping must map at least one Inth category to a non-empty list of RudderStack consent IDs'
		);
	}

	return normalized;
};

const buildPreConsentLoadOptions = function buildPreConsentLoadOptions(
	loadOptions: RudderStackLoadOptions
): RudderStackLoadOptions {
	let userConsentManagement: JsonObject = {};
	if (isJsonObjectValue(loadOptions.consentManagement)) {
		userConsentManagement = loadOptions.consentManagement;
	}

	let userPreConsent: JsonObject = {};
	if (isJsonObjectValue(loadOptions.preConsent)) {
		userPreConsent = loadOptions.preConsent;
	}

	// Storage strategy 'none' is the conservative default; a user preConsent
	// may relax it (for example 'session' for session stitching).
	let storage: JsonObject = { strategy: 'none' };
	if (isJsonObjectValue(userPreConsent.storage)) {
		// oxlint-disable-next-line prefer-destructuring -- Preserve declaration order, interface shape, and public compatibility.
		storage = userPreConsent.storage;
	}

	// oxlint-disable-next-line sort-keys -- Preserve declaration order, interface shape, and public compatibility.
	return {
		...loadOptions,
		// Deep-merged so a partial user preConsent can never drop the
		// safety-critical fields: enabled stays true and delivery stays
		// 'buffer' — the SDK's only other DeliveryType, 'immediate', would
		// send pre-consent events to the data plane.
		preConsent: {
			...userPreConsent,
			enabled: true,
			events: { delivery: 'buffer' },
			storage,
		},
		consentManagement: {
			...userConsentManagement,
			enabled: true,
			provider: 'custom',
		},
	};
};

/**
 * Builds the serializable manifest behind {@link rudderstack}. The write key
 * must already be trimmed, and the data plane a valid https URL or hostname.
 *
 * @throws {Error} When `consentManagement` is invalid.
 */
export const resolveRudderstackManifest = function resolveRudderstackManifest({
	writeKey,
	dataPlaneUrl,
	dataPlaneHost,
	consentManagement,
	loadOptions = {},
	trackPageView = true,
}: Omit<RudderStackSourceOptions, 'scriptUrl'> &
	(
		| { dataPlaneUrl: string; dataPlaneHost?: string }
		| { dataPlaneUrl?: undefined; dataPlaneHost: string }
	)): ResolvedManifest {
	let manifest: VendorManifest = rudderstackManifest;
	let resolvedLoadOptions = loadOptions;

	if (consentManagement) {
		const consentMapping = validateConsentMapping(consentManagement);

		// Pre-consent mode: the SDK loads immediately but inert (no persistent
		// storage, buffered events) and Inth signals consent decisions through
		// rudderanalytics.consent() — queued before load, live afterwards.
		manifest = {
			...manifest,
			alwaysLoad: true,
			consentMapping,
			consentSignal: 'rudderstack',
			consentSignalTarget: 'rudderanalytics',
			persistAfterConsentRevoked: true,
		} satisfies VendorManifest;
		resolvedLoadOptions = buildPreConsentLoadOptions(loadOptions);
	}

	if (!trackPageView) {
		manifest = {
			...manifest,
			install: manifest.install.filter(
				(step) =>
					!(
						step.type === 'callGlobal' &&
						step.global === 'rudderanalytics' &&
						step.method === 'page'
					)
			),
		} satisfies VendorManifest;
	}

	return getCompiledManifest(manifest, {
		dataPlaneUrl: dataPlaneUrl ?? `https://${dataPlaneHost}`,
		loadOptions: resolvedLoadOptions,
		writeKey,
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; a data plane URL with a port or path, `loadOptions`,
 * `consentManagement` and `scriptUrl` stay npm-only. Marked pure so a bundler
 * drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'rudderstack',
		{
			// The data plane receives events; the SDK itself always loads from
			// RudderStack's CDN.
			dataPlaneHost: {
				example: 'example.dataplane.rudderstack.com',
				kind: 'hostname',
				label: 'Data plane hostname',
				required: true,
			},
			trackPageView: {
				default: true,
				kind: 'boolean',
				label: 'Track page views',
			},
			writeKey: {
				example: '2AbCdEfGhIjKlMnOpQrStUvWxYz',
				kind: 'id',
				label: 'Write key',
				pattern: '^[A-Za-z0-9]+$',
				required: true,
			},
		},
		resolveRudderstackManifest
	);

/**
 * Creates a RudderStack JavaScript SDK script.
 *
 * @see https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/quickstart/
 *
 * @throws {Error} When `scriptUrl` is not HTTPS or `consentManagement` is
 *   invalid.
 *
 * @remarks
 * When `writeKey` is missing or blank, both `dataPlaneUrl` and
 * `dataPlaneHost` are, `dataPlaneUrl` is not an HTTPS URL, or `dataPlaneHost`
 * is not a hostname, the helper logs the problem with `console.error` and
 * returns a script that never loads.
 *
 * RudderStack collects customer behavior and sends it to destinations through
 * your configured data plane. By default Inth gates the browser SDK on
 * `measurement` consent and unloads it when that consent is revoked.
 * `loadOptions` is passed directly as the third `load()` argument and must be
 * JSON-serializable.
 *
 * Pass `consentManagement` to opt into RudderStack's pre-consent mode instead:
 * the SDK loads immediately with no persistent storage and buffered events,
 * and Inth signals every consent decision through `rudderanalytics.consent()`
 * with your mapped consent IDs — preserving pre-consent event attribution for
 * users who consent. Requires consent IDs on every RudderStack destination.
 *
 * @example
 * ```ts
 * import { rudderstack } from '@inth/integrations/rudderstack';
 *
 * rudderstack({
 * 	writeKey: 'WRITE_KEY',
 * 	dataPlaneUrl: 'https://example.dataplane.rudderstack.com',
 * 	loadOptions: {
 * 		useBeacon: true,
 * 	},
 * });
 * ```
 */
export const rudderstack = function rudderstack({
	scriptUrl,
	dataPlaneUrl: dataPlaneUrlOption,
	dataPlaneHost: dataPlaneHostOption,
	...options
}: RudderStackOptions): Script {
	const writeKey = readId(options.writeKey);
	if (writeKey === undefined) {
		return skipMissingId('rudderstack', 'writeKey', skippedRudderstackScript);
	}

	let dataPlane: { dataPlaneUrl: string } | { dataPlaneHost: string };
	const dataPlaneUrl = readId(dataPlaneUrlOption);
	const dataPlaneHost = readId(dataPlaneHostOption)?.toLowerCase();
	if (dataPlaneUrl !== undefined) {
		if (!isHttpsUrl(dataPlaneUrl)) {
			return skipScript(
				'rudderstack: dataPlaneUrl must be a valid https URL',
				skippedRudderstackScript
			);
		}
		dataPlane = { dataPlaneUrl };
	} else if (dataPlaneHost === undefined) {
		return skipMissingId(
			'rudderstack',
			'dataPlaneUrl',
			skippedRudderstackScript
		);
	} else if (isHostname(dataPlaneHost)) {
		dataPlane = { dataPlaneHost };
	} else {
		return skipScript(
			'rudderstack: dataPlaneHost must be a hostname with no scheme, port or path',
			skippedRudderstackScript
		);
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveRudderstackManifest({ ...options, ...dataPlane, writeKey })
		),
		httpsScriptUrl('rudderstack', scriptUrl)
	);
};
