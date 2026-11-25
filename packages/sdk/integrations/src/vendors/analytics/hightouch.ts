import type { Script } from '@inth/sdk/engine';

import { resolveManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { VendorManifest } from '../../types';
import { ANALYTICS_JS_QUEUE_METHODS } from '../_shared/analytics-js';
import { readId, skipMissingId } from '../_shared/required-id';
import { resolveScriptUrl, trimToUndefined } from '../_shared/script-url';

const DEFAULT_HIGHTOUCH_SCRIPT_URL =
	'https://cdn.hightouch-events.com/browser/release/v1-latest/events.min.js';

export const HIGHTOUCH_QUEUE_METHODS = [
	...ANALYTICS_JS_QUEUE_METHODS,
	'load',
] as const;

/**
 * Public Hightouch Events browser API exposed on `window.htevents`.
 *
 * The official browser snippet starts as an array-backed queue and the loaded
 * SDK replaces it with an initialized runtime object. Use this interface for
 * calls made after consent has allowed the SDK to load.
 *
 * @example
 * ```ts
 * window.htevents?.track('Signup Completed', { plan: 'pro' });
 * ```
 */
export interface HightouchApi {
	/**
	 * Tracks a form submission.
	 *
	 * @param form - Form element, selector, or vendor-supported form target.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	trackSubmit: (
		form: unknown,
		event: string,
		properties?: Record<string, unknown>
	) => unknown;
	/**
	 * Tracks a click interaction.
	 *
	 * @param element - Element, selector, or vendor-supported click target.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	trackClick: (
		element: unknown,
		event: string,
		properties?: Record<string, unknown>
	) => unknown;
	/**
	 * Tracks link clicks before navigation.
	 *
	 * @param link - Link element, selector, or vendor-supported link target.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	trackLink: (
		link: unknown,
		event: string,
		properties?: Record<string, unknown>
	) => unknown;
	/**
	 * Tracks form submissions with form-specific semantics.
	 *
	 * @param form - Form element, selector, or vendor-supported form target.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	trackForm: (
		form: unknown,
		event: string,
		properties?: Record<string, unknown>
	) => unknown;
	/**
	 * Tracks a classic pageview event.
	 *
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	pageview: (url?: string) => unknown;
	/**
	 * Identifies a user and associates traits with that identity.
	 *
	 * @param context - Optional event context overrides.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	identify: (
		userId: string,
		traits?: Record<string, unknown>,
		context?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Clears the current user identity state.
	 *
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	reset: () => unknown;
	/**
	 * Associates the current user with a group or account.
	 *
	 * @param context - Optional event context overrides.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	group: (
		groupId: string,
		traits?: Record<string, unknown>,
		context?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Tracks a named event.
	 *
	 * @param context - Optional event context overrides.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	track: (
		event: string,
		properties?: Record<string, unknown>,
		context?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Registers a callback that fires when the SDK is ready.
	 *
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	ready: (callback: () => void) => unknown;
	/**
	 * Aliases one user identifier to another.
	 *
	 * @param userId - New canonical user identifier.
	 * @param previousId - Optional previous identifier.
	 * @param context - Optional event context overrides.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	alias: (
		userId: string,
		previousId?: string,
		context?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Enables or disables debug logging in the SDK.
	 *
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	debug: (enabled?: boolean) => unknown;
	/**
	 * Tracks a page view with optional category, name, properties, and context.
	 *
	 * @param category - Optional page category or page name.
	 * @param name - Optional page name or properties payload.
	 * @param context - Optional event context overrides.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	page: (
		category?: string,
		name?: string | Record<string, unknown>,
		properties?: Record<string, unknown>,
		context?: Record<string, unknown>,
		callback?: () => void
	) => unknown;
	/**
	 * Registers a one-time event listener on the SDK emitter.
	 *
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	once: (event: string, callback: (...args: unknown[]) => void) => unknown;
	/**
	 * Removes an SDK event listener.
	 *
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	off: (event: string, callback?: (...args: unknown[]) => void) => unknown;
	/**
	 * Registers an SDK event listener.
	 *
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	on: (event: string, callback: (...args: unknown[]) => void) => unknown;
	/**
	 * Adds source middleware before events are dispatched.
	 *
	 * @param middleware - Middleware function or vendor-supported middleware.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	addSourceMiddleware: (middleware: unknown) => unknown;
	/**
	 * Adds integration middleware for destination-specific event transforms.
	 *
	 * @param middleware - Middleware function or vendor-supported middleware.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	addIntegrationMiddleware: (
		integration: string,
		middleware: unknown
	) => unknown;
	/**
	 * Sets the anonymous ID used for subsequent events.
	 *
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	setAnonymousId: (anonymousId: string) => unknown;
	/**
	 * Adds destination middleware for event delivery.
	 *
	 * @param middleware - Middleware function or vendor-supported middleware.
	 * @returns The Hightouch runtime or a promise-like value from the SDK.
	 */
	addDestinationMiddleware: (
		destination: string,
		middleware: unknown
	) => unknown;
}

declare global {
	interface Window {
		htevents?: HightouchApi;
	}
}

/**
 * Hightouch Events vendor manifest.
 *
 * Creates Hightouch's analytics.js-style `window.htevents` queue, records the
 * write key/load options expected by the standalone loader, queues the
 * `load()` and optional `page()` calls, then lets Inth own the script element.
 */
export const hightouchManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			ifUndefined: true,

			name: 'htevents',
			type: 'setGlobal',
			value: [],
		},
		{
			methods: [...HIGHTOUCH_QUEUE_METHODS],

			target: 'htevents',
			type: 'defineQueueMethods',
		},
		{
			path: ['htevents', '_writeKey'],
			type: 'setGlobalPath',
			value: '{{writeKey}}',
		},
		{
			path: ['htevents', '_loadOptions'],
			type: 'setGlobalPath',
			value: '{{loadOptions}}',
		},
	],
	category: 'measurement',
	install: [
		{
			args: ['{{writeKey}}', '{{loadOptions}}'],

			global: 'htevents',
			method: 'load',
			type: 'callGlobal',
		},
		{
			global: 'htevents',
			method: 'page',

			type: 'callGlobal',
		},
		{
			async: true,

			// oxlint-disable-next-line integrations/fixed-script-host -- pending conversion: the site's scriptUrl option can set the whole URL
			src: '{{scriptUrl}}',
			type: 'loadScript',
		},
	],
	vendor: 'hightouch',
	vendorDetails: {
		homepageUrl: 'https://hightouch.com/',
		legalName: 'Carry Technologies, Inc.',
		name: 'Hightouch',
		privacyPolicyUrl: 'https://hightouch.com/privacy-policy',
	},
} as const satisfies VendorManifest;

export interface HightouchOptions {
	/**
	 * Hightouch Events write key from your Event Source.
	 */
	writeKey: string;

	/**
	 * Optional Hightouch Events API host.
	 *
	 * Hightouch's browser SDK defaults to `us-east-1.hightouch-events.com`.
	 * Pass this only when your Event Source uses another region or a first-party
	 * tracking host.
	 */
	apiHost?: string;

	/**
	 * Queue the initial `htevents.page()` call during setup.
	 *
	 * @default true
	 */
	trackPageView?: boolean;

	/**
	 * Optional full loader URL override.
	 *
	 * @default 'https://cdn.hightouch-events.com/browser/release/v1-latest/events.min.js'
	 */
	scriptUrl?: string;
}

const normalizeApiHost = function normalizeApiHost(
	apiHost: string | undefined
): string | undefined {
	return trimToUndefined(apiHost);
};

/**
 * Creates a Hightouch Events browser SDK script.
 *
 * @see https://hightouch.com/docs/events/sdks/browser
 *
 * @remarks
 * When `writeKey` is missing or blank, the helper logs
 * `hightouch: missing or invalid writeKey` with `console.error` and returns
 * a script that never loads.
 *
 * Hightouch Events collects customer behavior and sends it to the configured
 * Event Source. Inth gates the browser SDK on `measurement` consent and does
 * not allowlist collection endpoints in live probes beyond the CDN loader.
 *
 * @example
 * ```ts
 * import { hightouch } from '@inth/integrations/hightouch';
 *
 * hightouch({
 * 	writeKey: 'WRITE_KEY',
 * 	apiHost: 'us-east-1.hightouch-events.com',
 * });
 * ```
 */
export const hightouch = function hightouch({
	writeKey,
	apiHost,
	trackPageView = true,
	scriptUrl,
}: HightouchOptions): Script {
	const normalizedWriteKey = readId(writeKey);
	if (normalizedWriteKey === undefined) {
		return skipMissingId('hightouch', 'writeKey', {
			category: 'measurement',
			manifest: hightouchManifest,
		});
	}
	const normalizedApiHost = normalizeApiHost(apiHost);
	// No `apiHost` key without a host, so the SDK keeps its default.
	const loadOptions =
		normalizedApiHost === undefined ? {} : { apiHost: normalizedApiHost };

	let manifest: VendorManifest = hightouchManifest;

	if (!trackPageView) {
		manifest = {
			...hightouchManifest,
			install: hightouchManifest.install.filter(
				(step) =>
					!(
						step.type === 'callGlobal' &&
						step.global === 'htevents' &&
						step.method === 'page'
					)
			),
		} satisfies VendorManifest;
	}

	return resolveManifest(manifest, {
		loadOptions,
		scriptUrl: resolveScriptUrl(scriptUrl, DEFAULT_HIGHTOUCH_SCRIPT_URL),
		writeKey: normalizedWriteKey,
	});
};
