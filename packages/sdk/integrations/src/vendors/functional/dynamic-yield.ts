import type { Script } from '@inth/sdk/engine';
import { dynamicYieldScript } from '@inth/sdk/manifest-runtime/adapters/dynamic-yield';
import type { DynamicYieldAdapterOptions } from '@inth/sdk/manifest-runtime/adapters/dynamic-yield';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import {
	createScriptReuse,
	getScriptRegistrations,
} from '../_shared/reuse-script';

/** Dynamic Yield page context from its Web implementation guide. */
export interface DynamicYieldRecommendationContext {
	/** The page type used by the section's product or content feed. */
	type: 'HOMEPAGE' | 'CATEGORY' | 'PRODUCT' | 'CART' | 'POST' | 'OTHER';
	/** Category hierarchy, product SKUs, post ID, or other page identifier. */
	data?: string[];
	/** Feed locale, for example `en_GB`. */
	lng?: string;
}

declare global {
	interface Window {
		DY?: {
			recommendationContext?: DynamicYieldRecommendationContext;
			userActiveConsent?: { accepted: boolean };
			[key: string]: unknown;
		};
	}
}

/**
 * Dynamic Yield setup and Active Cookie Consent signals, on the US data
 * center. The Dynamic Yield adapter in `@inth/sdk` loads `api_static.js`
 * and shares the consent signal across owners.
 */
export const dynamicYieldManifest = {
	...vendorManifestContract,
	category: 'experience',
	install: [
		{ name: 'DY', type: 'setGlobal', value: {} },
		{
			path: ['DY', 'userActiveConsent'],
			type: 'setGlobalPath',
			value: { accepted: true },
		},
		{
			async: false,
			src: 'https://cdn.dynamicyield.com/api/{{sectionPath}}/api_dynamic.js',
			type: 'loadScript',
		},
	],
	onConsentDenied: [
		{
			path: ['DY', 'userActiveConsent'],
			type: 'setGlobalPath',
			value: { accepted: false },
		},
	],
	onConsentGranted: [
		{
			path: ['DY', 'userActiveConsent'],
			type: 'setGlobalPath',
			value: { accepted: true },
		},
	],
	resourceKey: 'dynamic-yield:https://cdn.dynamicyield.com/api/{{sectionPath}}',
	vendor: 'dynamic-yield',
	vendorDetails: {
		homepageUrl: 'https://www.dynamicyield.com/',
		legalName: 'Dynamic Yield Ltd.',
		name: 'Dynamic Yield',
		privacyPolicyUrl: 'https://www.dynamicyield.com/privacy-policy/',
	},
} as const satisfies VendorManifest;

/** The same manifest on the EU data center. */
export const dynamicYieldEuManifest = {
	...dynamicYieldManifest,
	install: [
		{ name: 'DY', type: 'setGlobal', value: {} },
		{
			path: ['DY', 'userActiveConsent'],
			type: 'setGlobalPath',
			value: { accepted: true },
		},
		{
			async: false,
			src: 'https://cdn-eu.dynamicyield.com/api/{{sectionPath}}/api_dynamic.js',
			type: 'loadScript',
		},
	],
	resourceKey:
		'dynamic-yield:https://cdn-eu.dynamicyield.com/api/{{sectionPath}}',
} as const satisfies VendorManifest;

export interface DynamicYieldOptions {
	/** Public section ID from the Dynamic Yield installation snippet. */
	sectionId: string;
	/** Data center for the section. @default 'us' */
	region?: 'us' | 'eu';
	/** Page context installed before either loader runs. Omit to preserve it. */
	recommendationContext?: DynamicYieldRecommendationContext;
	/** Consent category or condition required to load. @default 'experience' */
	category?: Script['category'];
	/** CSP nonce for both loaders. Provider-injected nonces are forwarded too. */
	nonce?: string;
}

/**
 * The manifest for Dynamic Yield: `api_dynamic.js` for the section and data
 * center, and the Dynamic Yield adapter, which loads `api_static.js`. The
 * section ID must already be trimmed and non-empty. The npm helper and the
 * Inth server both build it here.
 */
export const resolveDynamicYieldManifest =
	function resolveDynamicYieldManifest({
		category = 'experience',
		recommendationContext,
		region = 'us',
		sectionId,
	}: Omit<DynamicYieldOptions, 'nonce'>): ResolvedManifest {
		const manifest: VendorManifest =
			region === 'eu' ? dynamicYieldEuManifest : dynamicYieldManifest;
		const settings: DynamicYieldAdapterOptions = { region, sectionId };
		return {
			...getCompiledManifest(
				// The page context is page data only a site's code has: npm-only.
				recommendationContext
					? {
							...manifest,
							install: [
								...manifest.install,
								{
									path: ['DY', 'recommendationContext'],
									type: 'setGlobalPath',
									value: recommendationContext,
								},
							],
						}
					: manifest,
				{ sectionPath: encodeURIComponent(sectionId) }
			),
			adapter: { id: 'dynamic-yield', options: { ...settings } },
			category,
			requires: 4,
		};
	};

/**
 * What the Inth server may set for Dynamic Yield: the section ID and the
 * data center. The page context and a CSP nonce stay npm-only.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'dynamicYield',
		{
			region: {
				default: 'us',
				kind: 'enum',
				label: 'Data center',
				values: ['us', 'eu'],
			},
			sectionId: {
				example: '8765432',
				kind: 'id',
				label: 'Section ID',
				pattern: '^[A-Za-z0-9_-]{1,64}$',
				required: true,
			},
		},
		resolveDynamicYieldManifest
	);

const createDynamicYieldScript = ({
	nonce,
	...options
}: DynamicYieldOptions): Script => {
	const { adapter, ...manifest } = resolveDynamicYieldManifest(options);
	return {
		...dynamicYieldScript(
			resolvedManifestToScript(manifest),
			adapter?.options as unknown as DynamicYieldAdapterOptions,
			{ nonce, registrations: getScriptRegistrations }
		),
		// A site's CSP nonce for both loaders: npm-only.
		nonce,
	};
};

const reuseDynamicYieldScript = createScriptReuse<DynamicYieldOptions>();

/**
 * Creates a Dynamic Yield script gated on experience consent.
 *
 * Loads `api_dynamic.js`, then `api_static.js`. This consent-gated sequence
 * differs from Dynamic Yield's recommended synchronous page-head installation.
 * Keep `reloadOnConsentRevoked` enabled to stop SDK code that already ran.
 * Active Cookie Consent must also be enabled by Dynamic Yield Support for the
 * SDK to honor `DY.userActiveConsent` updates.
 *
 * @remarks A missing or blank `sectionId` logs
 * `dynamicYield: missing or invalid sectionId` and returns a script that never
 * loads. No Dynamic Yield global or preconnect is created before consent.
 * @example
 * dynamicYield({ sectionId: 'YOUR_SECTION_ID', region: 'eu' });
 * @see https://dy.dev/docs/implement-script
 * @see https://dy.dev/docs/active-cookie-consent
 */
export const dynamicYield = function dynamicYield(
	options: DynamicYieldOptions
): Script {
	const category = options?.category ?? 'experience';
	const sectionId = readId(options?.sectionId);
	if (sectionId === undefined) {
		return skipMissingId('dynamicYield', 'sectionId', {
			category,
			manifest: dynamicYieldManifest,
		});
	}
	return reuseDynamicYieldScript(
		{
			...options,
			category,
			nonce: options.nonce?.trim() || undefined,
			region: options.region ?? 'us',
			sectionId,
		},
		createDynamicYieldScript
	);
};
