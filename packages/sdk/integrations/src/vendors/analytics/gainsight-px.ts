import type { AllConsentNames, HasCondition, Script } from '@inth/sdk/engine';
import {
	assertGainsightPxSetup,
	gainsightPxScript,
} from '@inth/sdk/manifest-runtime/adapters/gainsight-px';
import type { GainsightPxAdapterOptions } from '@inth/sdk/manifest-runtime/adapters/gainsight-px';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type {
	ManifestStep,
	ResolvedManifest,
	VendorManifest,
} from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { createScriptReuse } from '../_shared/reuse-script';
import { withScriptUrl } from '../_shared/script-url';

/** JSON values accepted by the Gainsight PX configuration and identify APIs. */
export type GainsightPxValue =
	| string
	| number
	| boolean
	| null
	| GainsightPxValue[]
	| { [key: string]: GainsightPxValue };

/** Optional fifth argument of the official PX installation snippet. */
export interface GainsightPxConfig {
	/** Store identity cookies on the complete hostname. @default false */
	fullDomainCookie?: boolean;
	/** Store cookie data in localStorage instead of cookies. @default false */
	localStorageCookie?: boolean;
	/** Prefer POST requests for tracking. @default false */
	usePOST?: boolean;
	/** Enable PX's engagement HTML sanitization. */
	htmlSanitization?: boolean;
	/** Allowed domains for content referenced by engagements. */
	htmlSanitizationAllowedDomains?: string[];
	/** Inth owns this switch and enables it only after mapped consent. */
	enableTag?: never;
	/** Other JSON-serializable SDK configuration values documented by PX. */
	[key: string]: GainsightPxValue | undefined;
}

/** A PX user or account identify payload, including custom attributes. */
export interface GainsightPxIdentity {
	/** Stable user or account ID. */
	id: string;
	/** Built-in or custom attributes. Dates use epoch milliseconds. */
	[attribute: string]: GainsightPxValue;
}

/** Shared Gainsight PX options, apart from identity. */
interface GainsightPxBaseOptions {
	/** Product/channel key from Administration > Products. */
	productKey: string;
	/** Gate for the whole SDK, including engagements. @default 'measurement' */
	category?: HasCondition<AllConsentNames>;
	/** JSON-serializable PX configuration, passed to `aptrinsic.c`. */
	config?: GainsightPxConfig;
	/** Complete loader URL override. Does not proxy PX's other requests. */
	scriptUrl?: string;
}

/** PX identifies an account only through a user identify call. */
type GainsightPxIdentityOptions =
	| {
			/** Optional identify call after mapped consent. */
			user: GainsightPxIdentity;
			/** Optional account argument of the user identify call. */
			account?: GainsightPxIdentity;
	  }
	| { user?: undefined; account?: undefined };

/** Configuration for consent-gated product analytics and engagements. */
export type GainsightPxOptions = GainsightPxBaseOptions &
	GainsightPxIdentityOptions;

// Keep the installed key across server startup and PX replacing its stub.
const productKeyGlobal = '__inthGainsightPxProductKey';
// PX may replace its stub and discard its queue before client hydration.
const setupGlobal = '__inthGainsightPxSetup';

/**
 * PX's official snippet queue, created only after mapped consent. The
 * Gainsight PX adapter in `@inth/sdk` keeps one PX installation per page.
 */
export const gainsightPxManifest = {
	...vendorManifestContract,
	category: '{{category}}',
	install: [
		{
			ifUndefined: true,
			name: 'aptrinsic',
			properties: { c: '{{config}}', p: '{{productKey}}' },
			queue: { property: 'q' },
			queueFormat: 'arguments',
			type: 'defineStubFunction',
		},
		{
			name: productKeyGlobal,
			type: 'setGlobal',
			value: '{{productKey}}',
		},
		{
			ifUndefined: false,
			name: setupGlobal,
			type: 'setGlobal',
			value: {
				account: '{{account}}',
				config: '{{config}}',
				productKey: '{{productKey}}',
				user: '{{user}}',
			},
		},
		{
			async: true,
			src: 'https://web-sdk.aptrinsic.com/api/aptrinsic.js?a={{productKeyParam}}',
			type: 'loadScript',
		},
	],
	// A shared mount can start under another owner's denial; the stub's config
	// enables the tag, so disable it before the SDK reads the queue.
	onBeforeLoadDenied: [
		{
			args: ['config', 'enableTag', false],
			global: 'aptrinsic',
			type: 'callGlobal',
		},
		{ args: ['reset'], global: 'aptrinsic', type: 'callGlobal' },
	],
	onBeforeLoadGranted: [
		{
			args: ['config', 'enableTag', true],
			global: 'aptrinsic',
			type: 'callGlobal',
		},
	],
	onConsentDenied: [
		{
			args: ['config', 'enableTag', false],
			global: 'aptrinsic',
			type: 'callGlobal',
		},
		{ args: ['reset'], global: 'aptrinsic', type: 'callGlobal' },
	],
	onConsentGranted: [
		{
			args: ['config', 'enableTag', true],
			global: 'aptrinsic',
			type: 'callGlobal',
		},
	],
	persistAfterConsentRevoked: 'loaded',
	vendor: 'gainsight-px',
	vendorDetails: {
		homepageUrl: 'https://www.gainsight.com/product-experience/',
		legalName: 'Gainsight, Inc.',
		name: 'Gainsight PX',
		privacyPolicyUrl: 'https://www.gainsight.com/policy/privacy/',
	},
} as const satisfies VendorManifest;

/** The identify call for a site's user, and its account when it has one. */
const identifyStep = (options: GainsightPxOptions): ManifestStep => ({
	args: options.account
		? ['identify', '{{user}}', '{{account}}']
		: ['identify', '{{user}}'],
	global: 'aptrinsic',
	type: 'callGlobal',
});

/**
 * The manifest for a PX product: the official queue stub and loader, and
 * the Gainsight PX adapter with the product key. The npm helper and the
 * Inth server both build it here. A site's own user identify call is a
 * per-visitor npm-only extra, added as two more steps. `productKey` must
 * already be trimmed and non-empty.
 */
export const resolveGainsightPxManifest = function resolveGainsightPxManifest(
	options: GainsightPxOptions
): ResolvedManifest {
	const { productKey } = options;
	const manifest: VendorManifest = options.user
		? {
				...gainsightPxManifest,
				onBeforeLoadGranted: [
					...gainsightPxManifest.onBeforeLoadGranted,
					identifyStep(options),
				],
				onConsentGranted: [
					...gainsightPxManifest.onConsentGranted,
					identifyStep(options),
				],
			}
		: gainsightPxManifest;
	return {
		...getCompiledManifest(manifest, {
			account: options.account,
			category: options.category ?? 'measurement',
			config: { ...options.config, enableTag: true },
			productKey,
			productKeyParam: encodeURIComponent(productKey),
			user: options.user,
		}),
		adapter: { id: 'gainsight-px', options: { productKey } },
		requires: 4,
	};
};

/**
 * What the Inth server may set for Gainsight PX: the product key. PX
 * config, the user and account identity, the category and a loader URL of
 * the site's own stay in the site's code, with the npm helper.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'gainsightPx',
		{
			productKey: {
				example: 'AP-PRODUCT-KEY-2',
				kind: 'id',
				label: 'Product key',
				pattern: '^[A-Za-z0-9-]{1,64}$',
				required: true,
			},
		},
		resolveGainsightPxManifest
	);

const reuseGainsightPxScript = createScriptReuse<GainsightPxOptions>();

// Match the manifest's own pending-stub check without serializing
// instrumented or bundled code.
const clearPendingGainsightPxSource = `(function(){if(typeof window==='undefined')return;var px=window.aptrinsic;if(typeof px==='function'&&Array.isArray(px.q)&&px.__sdkBundleStarted!==true){Reflect.deleteProperty(window,'aptrinsic');Reflect.deleteProperty(window,'__inthGainsightPxProductKey')}})();`;

const createGainsightPxScript = function createGainsightPxScript(
	options: GainsightPxOptions
): Script {
	const { adapter, ...manifest } = resolveGainsightPxManifest(options);
	const base = withScriptUrl(
		resolvedManifestToScript(manifest),
		options.scriptUrl
	);
	const script = gainsightPxScript(
		base,
		adapter?.options as unknown as GainsightPxAdapterOptions,
		{ account: options.account, config: options.config, user: options.user }
	);
	const { onBeforeLoad, serverStart } = base;
	if (serverStart) {
		// oxlint-disable-next-line integrations/no-vendor-callbacks -- npm-only: a site's server render starts PX from the HTML with its config and identity; the Inth server's adapter scripts start in the browser
		script.serverStart = (info, started) => {
			if (started.onBeforeLoad !== script.onBeforeLoad) {
				return;
			}
			const start = serverStart(info, { ...started, onBeforeLoad });
			return start
				? {
						...start,
						code: `${info.hasConsent ? clearPendingGainsightPxSource : ''}${start.code}`,
					}
				: undefined;
		};
	}
	return script;
};

/**
 * Creates a Gainsight PX script that waits for mapped consent.
 *
 * On grant, creates the official `aptrinsic` queue with `p` and `c`, enables
 * the tag and optionally queues `identify`. On revocation, disables the tag
 * and requests a reset. PX currently resets internally when disabled and
 * ignores a subsequent reset command while disabled.
 *
 * @param options - PX product, identity and configuration values.
 * @returns The consent-gated PX script.
 * @remarks A missing or blank `productKey` logs an error and returns a script
 * that never loads. Keep `reloadOnConsentRevoked` enabled to end the loaded
 * SDK's listeners and timers, including an in-flight installation. Completed
 * loaders are retained so another grant uses the same SDK without executing
 * its bundle twice. After disposal, PX's execution marker lets later mounts
 * use its existing API without another loader. Disposal does not stop the SDK.
 * Pending loaders are removed on revocation. A retry before SDK startup
 * rebuilds the pending queue from the current options. After startup, keep
 * the same `config` for the page's lifetime, including after disposal.
 * Hydration requires matching server and client options, including when PX
 * finishes startup before hydration; mismatches throw before adoption.
 * @throws {Error} If a different product key is supplied after this helper starts PX.
 * Reload the page to switch products.
 * @throws {Error} If configuration changes after this helper starts PX.
 * Reload the page to change startup configuration.
 * @throws {Error} If server setup differs from the client options during hydration.
 * @example
 * gainsightPx({ productKey: 'AP-PRODUCT-KEY-2' });
 * @see https://support.gainsight.com/PX/API_for_Developers/01About/Work_with_Gainsight_PX_Web_SDK
 * @see https://support.gainsight.com/PX/API_for_Developers/02Usage_of_Different_APIs/Use_Config_API
 */
export const gainsightPx = function gainsightPx(
	options: GainsightPxOptions
): Script {
	const productKey = readId(options?.productKey);
	if (productKey === undefined) {
		return skipMissingId('gainsightPx', 'productKey', {
			category: options?.category ?? 'measurement',
			manifest: gainsightPxManifest,
		});
	}
	assertGainsightPxSetup(productKey, options);
	return reuseGainsightPxScript(
		{ ...options, productKey },
		createGainsightPxScript
	);
};
