import type { AllConsentNames, HasCondition, Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { runtimeTimestampValue, vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { trimToUndefined } from '../_shared/script-url';

declare global {
	interface Window {
		wisepops?: ((...args: unknown[]) => void) & {
			l?: number;
			q?: IArguments[];
		};
	}
}

/** Wisepops loader, snippet queue and consent-gated cookie consent grant. */
export const wisepopsManifest = {
	...vendorManifestContract,
	bootstrap: [
		{
			name: 'wisepops',
			properties: { l: runtimeTimestampValue },
			queue: { property: 'q' },
			queueFormat: 'arguments',
			type: 'defineStubFunction',
		},
	],
	category: '{{category}}',
	install: [
		{
			args: ['options', '{{runtimeOptions}}'],
			global: 'wisepops',
			type: 'callGlobal',
		},
		{
			defer: true,
			src: 'https://wisepops.net/loader.js?v=3&h={{siteParam}}',
			type: 'loadScript',
		},
	],
	onLoadGranted: [
		{
			args: ['consent', 'granted'],
			global: 'wisepops',
			type: 'callGlobal',
		},
	],
	vendor: 'wisepops',
	vendorDetails: {
		homepageUrl: 'https://wisepops.com/',
		legalName: 'Wisepops SAS',
		name: 'Wisepops',
		privacyPolicyUrl: 'https://wisepops.com/privacy-policy',
	},
} as const satisfies VendorManifest;

/** Documented Wisepops options applied before its loader executes. */
export interface WisepopsRuntimeOptions {
	/** Automatic pageview tracking. @default 'url' */
	autoPageview?: 'url' | 'init' | false;
	/** Use localStorage instead of cookies. @default false */
	browserStorage?: boolean;
	/** Maximum size of each Wisepops cookie, in bytes. */
	cookieMaxSize?: number;
}

/** Wisepops site identity, consent condition and loader configuration. */
export interface WisepopsOptions {
	/** Public site identifier from the setup snippet's `h` URL parameter. */
	siteId: string;
	/** Consent condition required before any Wisepops setup. @default 'marketing' */
	category?: HasCondition<AllConsentNames>;
	/** Documented runtime options. The helper always sets `defaultConsent: 'denied'`. */
	options?: WisepopsRuntimeOptions;
	/** CSP nonce for the Inth-managed loader element. */
	nonce?: string;
}

/**
 * Builds the serializable manifest behind {@link wisepops}. `siteId` must
 * already be trimmed and non-empty.
 */
export const resolveWisepopsManifest = function resolveWisepopsManifest({
	siteId,
	category = 'marketing',
	options,
}: Pick<WisepopsOptions, 'siteId' | 'category' | 'options'>): ResolvedManifest {
	const runtimeOptions: Record<string, unknown> = {
		...options,
		defaultConsent: 'denied',
	};
	// Wisepops uses cookies unless told otherwise, so `false` is left out and
	// a dashboard form, which fills it in, sends what a site that left it
	// unset sends.
	if (runtimeOptions.browserStorage === false) {
		delete runtimeOptions.browserStorage;
	}
	return getCompiledManifest(wisepopsManifest, {
		category,
		runtimeOptions,
		siteParam: encodeURIComponent(siteId),
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `category`, `nonce` and turning off automatic page views stay
 * npm-only. Marked pure so a bundler drops it from an npm bundle that never
 * reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'wisepops',
		{
			options: {
				fields: {
					autoPageview: {
						default: 'url',
						kind: 'enum',
						label: 'Count page views',
						values: ['url', 'init'],
					},
					browserStorage: {
						default: false,
						kind: 'boolean',
						label: 'Store in localStorage instead of cookies',
					},
					cookieMaxSize: {
						example: 4096,
						integer: true,
						kind: 'number',
						label: 'Largest cookie, in bytes',
						min: 1,
						required: false,
					},
				},
				kind: 'object',
				label: 'Wisepops options',
				required: false,
			},
			siteId: {
				example: 'AbC123dEf4',
				kind: 'id',
				label: 'Site ID',
				pattern: '^[A-Za-z0-9_-]+$',
				required: true,
			},
		},
		resolveWisepopsManifest
	);

/**
 * Creates a Wisepops script gated on marketing consent by default.
 *
 * The helper creates the snippet queue only after the mapped consent permits
 * the vendor. It configures denied cookie consent before loading the SDK and
 * grants cookie consent after a permitted load completes.
 *
 * Keep `reloadOnConsentRevoked` enabled. Wisepops cannot revoke cookie consent
 * programmatically, and removing the loader cannot stop an SDK that has run.
 *
 * @remarks When `siteId` is missing or blank, the helper logs
 *   `wisepops: missing or invalid siteId` with `console.error` and returns a
 *   script that never loads. Copy the public ID from Settings > Install Wisepops.
 * @example
 * wisepops({ siteId: 'YOUR_WISEPOPS_SITE_ID' });
 * @see https://support.wisepops.com/en/articles/9975472-how-to-add-wisepops-to-a-custom-website
 * @see https://support.wisepops.com/en/articles/12679556-cookie-consent-mode
 */
export const wisepops = function wisepops(options: WisepopsOptions): Script {
	const category = options?.category ?? 'marketing';
	const siteId = readId(options?.siteId);
	if (siteId === undefined) {
		return skipMissingId('wisepops', 'siteId', {
			category,
			manifest: wisepopsManifest,
		});
	}

	return {
		...resolvedManifestToScript(
			resolveWisepopsManifest({ category, options: options.options, siteId })
		),
		nonce: trimToUndefined(options.nonce),
	};
};
