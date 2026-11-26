import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

/**
 * Default Heap config-loader base URL.
 *
 * Heap's current web installation snippet loads account configuration from a
 * per-environment `heap_config.js` URL. That configuration then chain-loads the
 * versioned heap.js runtime selected for the environment.
 */
export const DEFAULT_HEAP_CONFIG_BASE_URL =
	'https://cdn.us.heap-api.com/config';

/**
 * Current heap.js v5 method stubs from Heap's official web snippet.
 *
 * These methods do not push `[method, args]` tuples into `window.heap`. They
 * push `{ name, fn }` records into `window.heapReadyCb`; each callback replays
 * the original call against the loaded `window.heap` runtime.
 */
export const HEAP_QUEUE_METHODS = [
	'init',
	'startTracking',
	'stopTracking',
	'track',
	'resetIdentity',
	'identify',
	'identifyHashed',
	'getSessionId',
	'getUserId',
	'getIdentity',
	'addUserProperties',
	'addEventProperties',
	'removeEventProperty',
	'clearEventProperties',
	'addAccountProperties',
	'addAdapter',
	'addTransformer',
	'addTransformerFn',
	'onReady',
	'addPageviewProperties',
	'removePageviewProperty',
	'clearPageviewProperties',
	'trackPageview',
] as const;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
interface JsonRecord {
	[key: string]: JsonValue;
}

export interface HeapReadyCallback {
	/** Heap method name captured by the pre-load snippet stub. */
	name: (typeof HEAP_QUEUE_METHODS)[number];
	/** Callback invoked by heap.js after the runtime is ready. */
	fn: () => void;
}

/**
 * Minimal public heap.js API exposed on `window.heap`.
 *
 * Before the real SDK loads, Inth creates an array-backed stub with these
 * methods. The config loader calls `heap.init(envId, clientConfig,
 * serverConfig)`, and heap.js drains `window.heapReadyCb` by invoking each
 * stored callback.
 */
export interface HeapApi {
	/** Environment/app id selected for this Heap installation. */
	envId?: string;
	/** Legacy alias used by some Heap runtime paths. */
	appid?: string;
	/** Client configuration passed into `heap.load()`. */
	clientConfig?: JsonRecord;
	/** Server configuration assigned by `heap_config.js` before heap.js loads. */
	serverConfig?: Record<string, unknown>;
	/**
	 * Initializes the heap.js runtime.
	 *
	 * @param serverConfig - Server-side configuration loaded by Heap.
	 */
	init: (
		envId: string,
		clientConfig?: JsonRecord,
		serverConfig?: Record<string, unknown>
	) => unknown;
	/**
	 * Starts Heap autocapture and event delivery.
	 */
	startTracking: () => unknown;
	/**
	 * Stops Heap tracking for the current runtime session.
	 */
	stopTracking: () => unknown;
	/**
	 * Tracks a custom Heap event.
	 */
	track: (event: string, properties?: Record<string, unknown>) => unknown;
	/**
	 * Clears the current Heap identity.
	 */
	resetIdentity: () => unknown;
	/**
	 * Identifies the current user.
	 */
	identify: (identity: string) => unknown;
	/**
	 * Identifies the current user with a hashed identity.
	 */
	identifyHashed: (identity: string) => unknown;
	/**
	 * Reads the current Heap session id.
	 *
	 * @returns Current session id when available.
	 */
	getSessionId: () => unknown;
	/**
	 * Reads the current Heap user id.
	 *
	 * @returns Current Heap user id when available.
	 */
	getUserId: () => unknown;
	/**
	 * Reads the current Heap identity.
	 *
	 * @returns Current identity when available.
	 */
	getIdentity: () => unknown;
	/**
	 * Adds properties to the current user.
	 *
	 * @param properties - User properties to merge.
	 */
	addUserProperties: (properties: Record<string, unknown>) => unknown;
	/**
	 * Adds properties to every subsequent event.
	 *
	 * @param properties - Event properties to merge.
	 */
	addEventProperties: (properties: Record<string, unknown>) => unknown;
	/**
	 * Removes a single persisted event property.
	 *
	 * @param property - Event property name to remove.
	 */
	removeEventProperty: (property: string) => unknown;
	/**
	 * Clears persisted event properties.
	 */
	clearEventProperties: () => unknown;
	/**
	 * Adds properties to the current account.
	 *
	 * @param properties - Account properties to merge.
	 */
	addAccountProperties: (properties: Record<string, unknown>) => unknown;
	/**
	 * Adds a Heap adapter.
	 *
	 * @param adapter - Adapter implementation accepted by heap.js.
	 */
	addAdapter: (adapter: unknown) => unknown;
	/**
	 * Adds a Heap event transformer.
	 *
	 * @param transformer - Transformer implementation accepted by heap.js.
	 */
	addTransformer: (transformer: unknown) => unknown;
	/**
	 * Adds a Heap transformer function.
	 *
	 * @param transformer - Transformer callback accepted by heap.js.
	 */
	addTransformerFn: (transformer: (...args: unknown[]) => unknown) => unknown;
	/**
	 * Registers a callback for Heap readiness.
	 */
	onReady: (callback: () => void) => unknown;
	/**
	 * Adds properties to subsequent pageview events.
	 *
	 * @param properties - Pageview properties to merge.
	 */
	addPageviewProperties: (properties: Record<string, unknown>) => unknown;
	/**
	 * Removes a single persisted pageview property.
	 *
	 * @param property - Pageview property name to remove.
	 */
	removePageviewProperty: (property: string) => unknown;
	/**
	 * Clears persisted pageview properties.
	 */
	clearPageviewProperties: () => unknown;
	/**
	 * Tracks a pageview event.
	 */
	trackPageview: (properties?: Record<string, unknown>) => unknown;
}

declare global {
	interface Window {
		heap?: HeapApi;
		heapReadyCb?: HeapReadyCallback[];
	}
}

/**
 * Heap vendor manifest.
 *
 * Reproduces the heap.js v5 snippet contract consumed by
 * `heap_config.js`: `window.heapReadyCb` receives `{ name, fn }` callback
 * records, `window.heap` stores `envId`/`appid` and `clientConfig`, and the
 * Heap configuration script chain-loads the versioned heap.js runtime.
 *
 * Heap does not document a browser opt-out API that can make an already loaded
 * runtime inert for Inth's purposes, so Inth gates the load on `measurement`
 * consent and unloads the script when that consent is revoked.
 */
export const heapManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			ifUndefined: true,

			name: 'heapReadyCb',
			type: 'setGlobal',
			value: [],
		},
		{
			ifUndefined: true,

			name: 'heap',
			type: 'setGlobal',
			value: [],
		},
		{
			path: ['heap', 'envId'],
			type: 'setGlobalPath',
			value: '{{envId}}',
		},
		{
			path: ['heap', 'appid'],
			type: 'setGlobalPath',
			value: '{{envId}}',
		},
		{
			path: ['heap', 'clientConfig'],
			type: 'setGlobalPath',
			value: '{{clientConfig}}',
		},
		{
			methods: [...HEAP_QUEUE_METHODS],
			// A grant after a revocation reruns setup while heap.js is still
			// running. Keep its live methods rather than queueing into stubs.
			preserveExisting: true,
			queue: { global: 'heapReadyCb' },
			queueFormat: 'callback',
			target: 'heap',
			type: 'defineQueueMethods',
		},
		{
			async: true,

			src: 'https://cdn.us.heap-api.com/config/{{envId}}/heap_config.js',
			type: 'loadScript',
		},
	],
	vendor: 'heap',
	vendorDetails: {
		homepageUrl: 'https://www.heap.io/',
		name: 'Heap',
		privacyPolicyUrl: 'https://contentsquare.com/privacy-policy/',
	},
} as const satisfies VendorManifest;

export interface HeapOptions {
	/**
	 * Heap environment/app id.
	 *
	 * Heap's app UI commonly shows this as a numeric string. Inth validates only
	 * that the value is a non-empty string after trimming because Heap's public
	 * install docs describe it generically as `YOUR_APP_ID`.
	 */
	envId: string;
	/**
	 * Optional heap.js client configuration.
	 *
	 * Values must be JSON-serializable: plain objects, arrays, strings, finite
	 * numbers, booleans, and `null`. Inth adds `shouldFetchServerConfig: false`
	 * to match Heap's current web installation snippet.
	 */
	clientConfig?: Record<string, unknown>;
	/**
	 * Optional full Heap config-loader URL override.
	 *
	 * @default 'https://cdn.us.heap-api.com/config/{envId}/heap_config.js'
	 */
	scriptUrl?: string;
}

const isPlainRecord = function isPlainRecord(
	value: unknown
): value is Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
};

const toJsonValue = function toJsonValue(
	value: unknown,
	path: string
): JsonValue {
	if (value === null) {
		return null;
	}

	if (typeof value === 'string' || typeof value === 'boolean') {
		return value;
	}

	if (typeof value === 'number') {
		if (Number.isFinite(value)) {
			return value;
		}

		throw new TypeError(
			`heap: clientConfig${path ? `.${path}` : ''} must be a finite number`
		);
	}

	if (Array.isArray(value)) {
		return value.map((item, index) => toJsonValue(item, `${path}[${index}]`));
	}

	if (isPlainRecord(value)) {
		const result: JsonRecord = {};

		for (const [key, nestedValue] of Object.entries(value)) {
			result[key] = toJsonValue(nestedValue, path ? `${path}.${key}` : key);
		}

		return result;
	}

	throw new TypeError(
		`heap: clientConfig${path ? `.${path}` : ''} must be JSON-serializable`
	);
};

const normalizeClientConfig = function normalizeClientConfig(
	clientConfig: Record<string, unknown> | undefined
): JsonRecord {
	const config = clientConfig ?? {};
	const normalized = toJsonValue(config, '');

	if (!isPlainRecord(normalized)) {
		throw new TypeError('heap: clientConfig must be a plain object');
	}

	return {
		...normalized,
		shouldFetchServerConfig: false,
	};
};

/**
 * Builds the serializable manifest behind {@link heap}.
 */
export const resolveHeapManifest = function resolveHeapManifest({
	envId,
	clientConfig,
}: Omit<HeapOptions, 'scriptUrl'>): ResolvedManifest {
	return getCompiledManifest(heapManifest, {
		clientConfig: normalizeClientConfig(clientConfig),
		envId,
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'heap',
		{
			envId: {
				example: '1234567890',
				kind: 'id',
				label: 'Environment ID',
				pattern: '^[0-9]+$',
				required: true,
			},
		},
		resolveHeapManifest
	);

/**
 * Creates a Heap web analytics script.
 *
 * @see https://developers.heap.io/docs/web
 *
 * @throws {TypeError} When `clientConfig` contains non-JSON values.
 *
 * @remarks
 * When `envId` is missing or blank, the helper logs
 * `heap: missing or invalid envId` with `console.error` and returns a script
 * that never loads.
 *
 * Heap autocaptures interactions as soon as heap.js loads. Inth therefore
 * gates the config loader on `measurement` consent and unloads the script when
 * that consent is revoked.
 *
 * @example
 * ```ts
 * import { heap } from '@inth/integrations/heap';
 *
 * const script = heap({
 * 	envId: '123456789',
 * 	clientConfig: {
 * 		disableTextCapture: true,
 * 	},
 * });
 * ```
 */
export const heap = function heap({
	envId,
	clientConfig,
	scriptUrl,
}: HeapOptions): Script {
	const normalizedEnvId = readId(envId);
	if (normalizedEnvId === undefined) {
		return skipMissingId('heap', 'envId', {
			category: 'measurement',
			manifest: heapManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveHeapManifest({ clientConfig, envId: normalizedEnvId })
		),
		scriptUrl
	);
};
