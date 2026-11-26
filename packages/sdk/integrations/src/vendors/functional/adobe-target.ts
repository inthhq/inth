import type { AllConsentNames, HasCondition, Script } from '@inth/sdk/engine';
import { adobeTargetWebSdkScript } from '@inth/sdk/manifest-runtime/adapters/adobe-target';
import type { AdobeTargetAdapterOptions } from '@inth/sdk/manifest-runtime/adapters/adobe-target';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest, resolveManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import {
	createScriptReuse,
	getScriptRegistrations,
} from '../_shared/reuse-script';
import { trimToUndefined } from '../_shared/script-url';

/** Supported at.js settings. The helper always enables Adobe's opt-in support. */
export interface AdobeTargetGlobalSettings {
	/** Adobe Opt-in service support. Always set to true by this helper. */
	optinEnabled?: true;
	/** Domain on which at.js writes its first-party cookies. */
	cookieDomain?: string;
	/** Use HTTPS and Secure cookies. */
	secureOnly?: boolean;
	/** Hide page content while Target retrieves offers. */
	bodyHidingEnabled?: boolean;
	/**
	 * CSS that at.js applies while it hides the page for offers.
	 * Adobe's default is `body { opacity: 0 }`.
	 */
	bodyHiddenStyle?: string;
	/** Retrieve page-load offers automatically. */
	pageLoadEnabled?: boolean;
	/** Retrieve SPA views automatically. */
	viewsEnabled?: boolean;
	/** Target delivery timeout in milliseconds. */
	timeout?: number;
	/** Adobe Visitor API timeout in milliseconds. */
	visitorApiTimeout?: number;
	/** CSP nonce for scripts that at.js creates. */
	cspScriptNonce?: string;
	/** CSP nonce for styles that at.js creates. */
	cspStyleNonce?: string;
}

interface AdobeTargetSharedOptions {
	/** Consent condition that permits the loader. @default 'experience' */
	category?: HasCondition<AllConsentNames>;
	/** CSP nonce for the loader element. */
	nonce?: string;
}

/** Load a customer-hosted at.js download from Adobe Target. */
export interface AdobeTargetAtJsOptions extends AdobeTargetSharedOptions {
	mode: 'atjs';
	/** Your self-hosted at.js URL. Adobe provides no shared at.js CDN. */
	scriptUrl: string;
	/** Applied before at.js executes, with optinEnabled forced to true. */
	targetGlobalSettings?: AdobeTargetGlobalSettings;
}

/** Load Adobe Experience Platform Web SDK for a Target-enabled datastream. */
export interface AdobeTargetWebSdkOptions extends AdobeTargetSharedOptions {
	mode: 'websdk';
	/** Public datastream ID from Adobe Data Collection. */
	datastreamId: string;
	/** Adobe organization ID including the @AdobeOrg suffix. */
	orgId: string;
	/** Exact stable Web SDK version, at least 2.21.0, for example '2.30.0'. */
	version: string;
}

/** Choose either the at.js loader or the Web SDK loader. */
export type AdobeTargetOptions =
	| AdobeTargetAtJsOptions
	| AdobeTargetWebSdkOptions;

interface AdobeOptIn {
	Categories?: { TARGET?: string };
	approve: (category: string) => void;
	deny: (category: string) => void;
}

type AdobeTargetWindow = Window & {
	adobe?: {
		OptInCategories?: { TARGET?: string };
		optIn?: AdobeOptIn;
	};
};

/** Customer-hosted at.js, gated on the configured consent condition. */
export const adobeTargetManifest = {
	...vendorManifestContract,
	category: '{{category}}',
	install: [
		{
			ifUndefined: false,
			name: 'targetGlobalSettings',
			type: 'setGlobal',
			value: '{{targetGlobalSettings}}',
		},
		// oxlint-disable-next-line integrations/fixed-script-host -- pending conversion: the site's scriptUrl option can set the whole URL
		{ async: true, src: '{{scriptUrl}}', type: 'loadScript' },
	],
	persistAfterConsentRevoked: true,
	vendor: 'adobe-target',
	vendorDetails: {
		homepageUrl: 'https://business.adobe.com/products/target/adobe-target.html',
		legalName: 'Adobe Inc.',
		name: 'Adobe Target',
		privacyPolicyUrl: 'https://www.adobe.com/privacy/policy.html',
	},
} as const satisfies VendorManifest;

/**
 * The Web SDK from Adobe's host. It stays installed after its first grant
 * so setConsent can stop it. The Adobe Target adapter in `@inth/sdk` starts
 * it with consent pending and sends consent.
 */
export const adobeTargetWebSdkManifest = {
	...adobeTargetManifest,
	install: [
		{
			async: true,
			src: 'https://cdn1.adoberesources.net/alloy/{{version}}/alloy.min.js',
			type: 'loadScript',
		},
	],
	observeConsentBeforeLoad: true,
} as const satisfies VendorManifest;

const signalAtJsConsent = function signalAtJsConsent(granted: boolean): void {
	const { adobe } = window as AdobeTargetWindow;
	const optIn = adobe?.optIn;
	const category = adobe?.OptInCategories?.TARGET ?? optIn?.Categories?.TARGET;
	if (optIn && category) {
		if (granted) {
			optIn.approve(category);
		} else {
			optIn.deny(category);
		}
	}
};

const createAtJsScript = function createAtJsScript(
	options: AdobeTargetAtJsOptions
): Script {
	const script = resolveManifest(adobeTargetManifest, {
		category: options.category ?? 'experience',
		scriptUrl: options.scriptUrl,
		targetGlobalSettings: {
			...options.targetGlobalSettings,
			optinEnabled: true,
		},
	});
	let granted = false;
	return {
		...script,
		nonce: trimToUndefined(options.nonce),
		observeConsentBeforeLoad: true,
		// oxlint-disable-next-line integrations/no-vendor-callbacks -- pending conversion
		onBeforeLoad(info) {
			if (!getScriptRegistrations(info).some((state) => state.hasConsent)) {
				return;
			}
			script.onBeforeLoad?.(info);
			granted = info.hasConsent;
			signalAtJsConsent(granted);
		},
		onConsentChange(info) {
			if (granted !== info.hasConsent) {
				granted = info.hasConsent;
				signalAtJsConsent(granted);
			}
		},
		onDispose() {
			if (granted) {
				granted = false;
				signalAtJsConsent(false);
			}
		},
	};
};

/**
 * The manifest for Adobe Target's Web SDK: alloy.min.js at the version
 * from Adobe's host, and the Adobe Target adapter with the datastream and
 * organization. The npm helper and the Inth server both build it here.
 */
export const resolveAdobeTargetWebSdkManifest =
	function resolveAdobeTargetWebSdkManifest({
		category,
		datastreamId,
		orgId,
		version,
	}: Pick<
		AdobeTargetWebSdkOptions,
		'category' | 'datastreamId' | 'orgId' | 'version'
	>): ResolvedManifest {
		const options: AdobeTargetAdapterOptions = { datastreamId, orgId };
		return {
			...getCompiledManifest(adobeTargetWebSdkManifest, {
				category: category ?? 'experience',
				version,
			}),
			adapter: { id: 'adobe-target', options: { ...options } },
			requires: 4,
		};
	};

const createWebSdkScript = function createWebSdkScript(
	options: AdobeTargetWebSdkOptions
): Script {
	const { adapter, ...manifest } = resolveAdobeTargetWebSdkManifest(options);
	return {
		...adobeTargetWebSdkScript(
			resolvedManifestToScript(manifest),
			adapter?.options as unknown as AdobeTargetAdapterOptions,
			{ registrations: getScriptRegistrations }
		),
		// The site's own nonce is npm-only.
		nonce: trimToUndefined(options.nonce),
	};
};

const reuseAtJsScript = createScriptReuse<AdobeTargetAtJsOptions>();
const reuseWebSdkScript = createScriptReuse<AdobeTargetWebSdkOptions>();

const isSupportedWebSdkVersion = (version: string): boolean => {
	if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(version)) {
		return false;
	}
	const [major = 0, minor = 0] = version.split('.').map(Number);
	return major > 2 || (major === 2 && minor >= 21);
};

/**
 * What the Inth server may set for Adobe Target: the Web SDK from Adobe's
 * host, with its datastream, organization and version. at.js has no shared
 * Adobe-hosted file, so a site loads its own download with the npm helper.
 * The consent condition and nonce are npm-only too. Marked pure so a
 * bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'adobeTarget',
		{
			datastreamId: {
				example: '0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d',
				kind: 'id',
				label: 'Datastream ID',
				pattern: '^[0-9A-Za-z_-]{1,64}$',
				required: true,
			},
			mode: {
				default: 'websdk',
				kind: 'enum',
				label: 'Library',
				values: ['websdk'],
			},
			orgId: {
				example: 'ABCDEF0123456789@AdobeOrg',
				kind: 'id',
				label: 'Organization ID, with @AdobeOrg',
				pattern: '^[0-9A-Za-z]{1,64}@AdobeOrg$',
				required: true,
			},
			version: {
				example: '2.30.0',
				kind: 'id',
				label: 'Web SDK version, 2.21.0 or later',
				// An exact stable version, 2.21.0 or later.
				pattern:
					'^(?:(?:[3-9]|[1-9][0-9]+)\\.(?:0|[1-9][0-9]*)|2\\.(?:2[1-9]|[3-9][0-9]|[1-9][0-9]{2,}))\\.(?:0|[1-9][0-9]*)$',
				required: true,
			},
		},
		({ mode: _mode, ...options }) => resolveAdobeTargetWebSdkManifest(options)
	);

/**
 * Loads Adobe Target only after the configured consent condition permits it.
 *
 * at.js uses Adobe's Opt-in service when that service is present. Web SDK
 * uses a dedicated installation of window.alloy and Adobe 1.0 setConsent.
 * Keep reloadOnConsentRevoked enabled to stop existing offers and handlers.
 *
 * @returns A consent-gated script, or an inactive script for invalid options.
 * @remarks Web SDK requires an exact stable version of 2.21.0 or later.
 * Blank required values and unsupported versions log an error and skip loading.
 * Remove existing at.js, Web SDK and Adobe Tags installations of the same SDK.
 * @example
 * adobeTarget({ mode: 'atjs', scriptUrl: '/scripts/at.js' });
 * @example
 * adobeTarget({
 *   mode: 'websdk', datastreamId: 'YOUR_DATASTREAM_ID',
 *   orgId: 'YOUR_ORG_ID@AdobeOrg', version: '2.30.0',
 * });
 */
export const adobeTarget = function adobeTarget(
	options: AdobeTargetOptions
): Script {
	const category = options?.category ?? 'experience';
	if (options?.mode === 'websdk') {
		const datastreamId = readId(options.datastreamId);
		const orgId = readId(options.orgId);
		const version = readId(options.version);
		if (datastreamId === undefined) {
			return skipMissingId('adobeTarget', 'datastreamId', {
				category,
				manifest: adobeTargetWebSdkManifest,
			});
		}
		if (orgId === undefined) {
			return skipMissingId('adobeTarget', 'orgId', {
				category,
				manifest: adobeTargetWebSdkManifest,
			});
		}
		if (version === undefined || !isSupportedWebSdkVersion(version)) {
			return skipMissingId('adobeTarget', 'version', {
				category,
				manifest: adobeTargetWebSdkManifest,
			});
		}
		return reuseWebSdkScript(
			{ ...options, datastreamId, orgId, version },
			createWebSdkScript
		);
	}
	const scriptUrl = readId(options?.scriptUrl);
	if (scriptUrl === undefined) {
		return skipMissingId('adobeTarget', 'scriptUrl', {
			category,
			manifest: adobeTargetManifest,
		});
	}
	return reuseAtJsScript(
		{ ...options, mode: 'atjs', scriptUrl },
		createAtJsScript
	);
};
