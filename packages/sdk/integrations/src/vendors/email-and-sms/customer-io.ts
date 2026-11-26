/* oxlint-disable unicorn/no-thenable -- `if` steps have a `then` field. */
import type { Script } from '@inth/sdk/engine';

import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { ANALYTICS_JS_QUEUE_METHODS } from '../_shared/analytics-js';
import { levelThreeScript } from '../_shared/level-three';
import { readId, skipMissingId } from '../_shared/required-id';
import { createScriptReuse } from '../_shared/reuse-script';
import {
	stripTrailingSlashes,
	trimToUndefined,
	withScriptUrl,
} from '../_shared/script-url';

declare global {
	interface Window {
		/** Absent before consent; an array queue while the SDK downloads. */
		cioanalytics?: {
			page?: (...args: unknown[]) => unknown;
			reset?: () => unknown;
		};
	}
}

const setupSteps = [
	{ name: 'cioanalytics', type: 'setGlobal', value: [] },
	{
		methods: [...ANALYTICS_JS_QUEUE_METHODS],
		preserveExisting: true,
		returnTarget: true,
		target: 'cioanalytics',
		type: 'defineQueueMethods',
	},
	{
		ifGlobalIsQueue: true,
		path: ['cioanalytics', '_writeKey'],
		type: 'setGlobalPath',
		value: '{{writeKey}}',
	},
	{
		ifGlobalIsQueue: true,
		path: ['cioanalytics', '_cdn'],
		type: 'setGlobalPath',
		value: '{{cdnUrl}}',
	},
	{
		ifGlobalIsQueue: true,
		path: ['cioanalytics', '_loadOptions'],
		type: 'setGlobalPath',
		value: '{{loadOptions}}',
	},
	{
		ifGlobalIsQueue: true,
		path: ['cioanalytics', 'SNIPPET_VERSION'],
		type: 'setGlobalPath',
		value: '4.15.3',
	},
] as const satisfies VendorManifest['install'];

/**
 * One page call per grant: on load with consent, or on a later grant once
 * the file loaded. A revoke clears the flag.
 */
const pageOnce = [
	{
		then: [
			{ name: 'paged', type: 'setFlag', value: true },
			{ global: 'cioanalytics', method: 'page', type: 'callGlobal' },
		],
		type: 'if',
		when: { all: [{ loaded: true }, { not: { flag: 'paged' } }] },
	},
] as const satisfies VendorManifest['install'];

/**
 * Customer.io Data Pipelines, installed only after consent. analytics.js
 * runs with `initialPageview` off, so the manifest sends one page call per
 * grant, and resets identity on revoke.
 */
export const customerIoManifest = {
	...vendorManifestContract,
	category: '{{category}}',
	install: [
		{
			async: true,
			attributes: { 'data-global-customerio-analytics-key': 'cioanalytics' },
			src: 'https://cdp.customer.io/v1/analytics-js/snippet/{{writeKeyPath}}/analytics.min.js',
			type: 'loadScript',
		},
	],
	onBeforeLoadGranted: setupSteps,
	onConsentDenied: [
		{ name: 'paged', type: 'setFlag', value: false },
		{ global: 'cioanalytics', method: 'reset', type: 'callGlobal' },
	],
	onConsentGranted: pageOnce,
	onLoadGranted: pageOnce,
	persistAfterConsentRevoked: true,
	vendor: 'customer-io',
	vendorDetails: {
		homepageUrl: 'https://customer.io/',
		legalName: 'Peaberry Software Inc.',
		name: 'Customer.io',
		privacyPolicyUrl: 'https://customer.io/legal/privacy-policy/',
	},
} as const satisfies VendorManifest;

/** {@link customerIoManifest} for a workspace in the EU region. */
const customerIoEuManifest = {
	...customerIoManifest,
	install: [
		{
			...customerIoManifest.install[0],
			src: 'https://cdp-eu.customer.io/v1/analytics-js/snippet/{{writeKeyPath}}/analytics.min.js',
		},
	],
} as const satisfies VendorManifest;

const regionHosts = {
	eu: 'https://cdp-eu.customer.io',
	us: 'https://cdp.customer.io',
} as const;

export interface CustomerIoOptions {
	/** Public Data Pipelines source write key. */
	writeKey: string;
	/** Region of the Customer.io workspace. @default 'us' */
	region?: 'us' | 'eu';
	/** Loader options. initialPageview is forced off; the helper owns page calls. */
	loadOptions?: Record<string, unknown>;
	/** Consent condition required before loading. @default 'marketing' */
	category?: Script['category'];
	/**
	 * HTTP(S) CDN origin for the loader, settings and SDK assets.
	 * Defaults to the region's CDN. Collection routing uses loadOptions.
	 */
	cdnUrl?: string;
	/** Override only the initial loader URL. Use cdnUrl for a CDN proxy. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link customerIo}. The write key
 * must already be trimmed and non-empty; `cdnOrigin`, an origin the helper
 * checked, sets the CDN analytics.js loads its other files from.
 */
export const resolveCustomerIoManifest = function resolveCustomerIoManifest({
	category = 'marketing',
	cdnOrigin,
	loadOptions,
	region = 'us',
	writeKey,
}: Pick<CustomerIoOptions, 'category' | 'loadOptions' | 'region'> & {
	writeKey: string;
	cdnOrigin?: string;
}): ResolvedManifest {
	return getCompiledManifest(
		region === 'eu' ? customerIoEuManifest : customerIoManifest,
		{
			category,
			cdnUrl: cdnOrigin ?? regionHosts[region],
			loadOptions: { ...loadOptions, initialPageview: false },
			writeKey,
			writeKeyPath: encodeURIComponent(writeKey),
		}
	);
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `loadOptions`, a custom consent condition, `cdnUrl` and
 * `scriptUrl` stay npm-only. Marked pure so a bundler drops it from an npm
 * bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'customerIo',
		{
			region: {
				default: 'us',
				kind: 'enum',
				label: 'Workspace region',
				values: ['us', 'eu'],
			},
			writeKey: {
				example: 'a1b2c3d4e5f6a7b8c9d0',
				kind: 'id',
				label: 'Write key',
				pattern: '^[A-Za-z0-9_-]{1,64}$',
				required: true,
			},
		},
		resolveCustomerIoManifest
	);

/** The checked CDN origin, or `undefined` for the region's own CDN. */
const readCdnOrigin = function readCdnOrigin(
	cdnUrl: string | undefined
): string | undefined {
	const value = trimToUndefined(cdnUrl);
	if (value === undefined) {
		return undefined;
	}
	let cdn: URL;
	try {
		cdn = new URL(stripTrailingSlashes(value));
	} catch (error) {
		if (!(error instanceof TypeError)) {
			throw error;
		}
		throw new Error('customerIo: cdnUrl must be an HTTP(S) origin', {
			cause: error,
		});
	}
	if (
		!['https:', 'http:'].includes(cdn.protocol) ||
		cdn.username ||
		cdn.password ||
		cdn.pathname !== '/' ||
		cdn.search ||
		cdn.hash
	) {
		throw new Error('customerIo: cdnUrl must be an HTTP(S) origin');
	}
	return cdn.origin;
};

const createCustomerIo = function createCustomerIo(
	options: CustomerIoOptions
): Script {
	const writeKey = readId(options.writeKey) as string;
	const region = options.region ?? 'us';
	if (region !== 'us' && region !== 'eu') {
		throw new Error("customerIo: region must be 'us' or 'eu'");
	}
	const cdnOrigin = readCdnOrigin(options.cdnUrl);
	const script = levelThreeScript(
		resolveCustomerIoManifest({
			category: options.category,
			cdnOrigin,
			loadOptions: options.loadOptions,
			region,
			writeKey,
		})
	);
	// A CDN proxy serves the loader too, unless scriptUrl names another one.
	return withScriptUrl(
		script,
		trimToUndefined(options.scriptUrl) ??
			(cdnOrigin &&
				`${cdnOrigin}/v1/analytics-js/snippet/${encodeURIComponent(writeKey)}/analytics.min.js`)
	);
};

const reuseCustomerIo = createScriptReuse<CustomerIoOptions>();

/**
 * Loads Customer.io once after consent and resets identity on revoke.
 * reset is not an opt-out. Keep reloadOnConsentRevoked enabled to stop the
 * running source and any destination SDKs.
 * @returns A gated script, or an inactive script for a missing key.
 * @throws {Error} If the region or CDN origin is invalid.
 * @example customerIo({ writeKey: 'YOUR_WRITE_KEY', region: 'eu' });
 * @see https://docs.customer.io/integrations/data-in/connections/javascript/in-app/
 */
export const customerIo = function customerIo(
	options: CustomerIoOptions
): Script {
	if (!readId(options?.writeKey)) {
		return skipMissingId('customerIo', 'writeKey', {
			category: options?.category ?? 'marketing',
			manifest: customerIoManifest,
		});
	}
	return reuseCustomerIo(options, createCustomerIo);
};
