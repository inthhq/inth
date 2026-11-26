import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		$crisp: unknown[][];
		CRISP_WEBSITE_ID: string;
		CRISP_RUNTIME_CONFIG?: {
			locale?: string;
			session_merge?: boolean;
		};
		CRISP_COOKIE_DOMAIN?: string;
		CRISP_COOKIE_EXPIRE?: number;
		CRISP_TOKEN_ID?: string;
	}
}

/**
 * Crisp vendor manifest.
 *
 * Seeds the Crisp queue and website ID before loading the chat client. An
 * existing `$crisp` queue array is kept, so calls the page queued earlier
 * reach Crisp. Optional runtime globals are added when provided by the helper
 * options.
 */
export const crispManifest = {
	...vendorManifestContract,
	category: 'functionality',
	install: [
		{
			ifUndefined: false,
			keepExistingQueue: true,
			name: '$crisp',
			type: 'setGlobal',
			value: [],
		},
		{
			ifUndefined: false,
			name: 'CRISP_WEBSITE_ID',
			type: 'setGlobal',
			value: '{{websiteId}}',
		},
		{
			async: true,
			src: 'https://client.crisp.chat/l.js',
			type: 'loadScript',
		},
	],
	vendor: 'crisp',
	vendorDetails: {
		homepageUrl: 'https://crisp.chat/',
		legalName: 'Crisp IM SAS',
		name: 'Crisp',
		privacyPolicyUrl: 'https://crisp.chat/privacy/',
	},
} as const satisfies VendorManifest;

export interface CrispOptions {
	/** Your Crisp website ID. */
	websiteId: string;

	/** Optional locale passed through `window.CRISP_RUNTIME_CONFIG`. */
	locale?: string;

	/** Optional cookie domain override for Crisp. */
	cookieDomain?: string;

	/** Optional cookie expiration in seconds. */
	cookieExpiry?: number;

	/** Optional Crisp token ID for session continuity. */
	tokenId?: string;

	/** Whether to merge anonymous sessions into token-backed sessions. */
	sessionMerge?: boolean;

	/** Whether to enable `$crisp` safe mode before other queued calls. */
	safeMode?: boolean;

	/** Crisp loader URL. */
	scriptSrc?: string;
}

const createCrispManifest = function createCrispManifest(
	options: Omit<CrispOptions, 'scriptSrc'>
): VendorManifest {
	const install: VendorManifest['install'] = [
		{
			ifUndefined: false,
			keepExistingQueue: true,
			name: '$crisp',
			type: 'setGlobal',
			value: [],
		},
		{
			ifUndefined: false,
			name: 'CRISP_WEBSITE_ID',
			type: 'setGlobal',
			value: '{{websiteId}}',
		},
	];

	if (options.locale !== undefined || options.sessionMerge !== undefined) {
		const value: { locale?: string; session_merge?: string } = {};
		if (options.locale !== undefined) {
			value.locale = '{{locale}}';
		}
		if (options.sessionMerge !== undefined) {
			value.session_merge = '{{sessionMerge}}';
		}

		install.push({
			ifUndefined: false,
			name: 'CRISP_RUNTIME_CONFIG',
			type: 'setGlobal',
			value,
		});
	}

	if (options.cookieDomain) {
		install.push({
			ifUndefined: false,
			name: 'CRISP_COOKIE_DOMAIN',
			type: 'setGlobal',
			value: '{{cookieDomain}}',
		});
	}

	if (options.cookieExpiry !== undefined) {
		install.push({
			ifUndefined: false,
			name: 'CRISP_COOKIE_EXPIRE',
			type: 'setGlobal',
			value: '{{cookieExpiry}}',
		});
	}

	if (options.tokenId) {
		install.push({
			ifUndefined: false,
			name: 'CRISP_TOKEN_ID',
			type: 'setGlobal',
			value: '{{tokenId}}',
		});
	}

	if (options.safeMode) {
		install.push({
			queue: '$crisp',
			type: 'pushToQueue',
			value: ['safe', true],
		});
	}

	install.push({
		async: true,
		src: 'https://client.crisp.chat/l.js',
		type: 'loadScript',
	});

	return {
		...crispManifest,
		install,
	};
};

/**
 * Builds the serializable manifest behind {@link crisp}. The website ID must
 * already be trimmed and non-empty.
 */
export const resolveCrispManifest = function resolveCrispManifest(
	options: Omit<CrispOptions, 'scriptSrc'>
): ResolvedManifest {
	return getCompiledManifest(createCrispManifest(options), {
		cookieDomain: options.cookieDomain,
		cookieExpiry: options.cookieExpiry,
		locale: options.locale,
		sessionMerge: options.sessionMerge,
		tokenId: options.tokenId,
		websiteId: options.websiteId,
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `tokenId` and `sessionMerge`, which belong to one visitor's
 * session, and `scriptSrc` stay npm-only. Marked pure so a bundler drops it
 * from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'crisp',
		{
			cookieDomain: {
				example: 'example.com',
				kind: 'id',
				label: 'Cookie domain',
				pattern:
					'^\\.?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$',
				required: false,
			},
			cookieExpiry: {
				example: 15_552_000,
				integer: true,
				kind: 'number',
				label: 'Cookie lifetime in seconds',
				min: 1,
				required: false,
			},
			locale: {
				example: 'en',
				kind: 'id',
				label: 'Locale',
				pattern: '^[a-z]{2,3}(?:-[a-z]{2,4})?$',
				required: false,
			},
			safeMode: {
				default: false,
				kind: 'boolean',
				label: 'Safe mode',
			},
			websiteId: {
				example: '6a3c2f1e-8b4d-4c7a-9e5f-0d1b2c3a4e5f',
				kind: 'id',
				label: 'Website ID',
				pattern:
					'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
				required: true,
			},
		},
		resolveCrispManifest
	);

/**
 * Creates a Crisp chat script.
 *
 * This manifest-based helper keeps the serializable queue/bootstrap globals and
 * omits the upstream ready callback wrapper.
 *
 * @remarks When `websiteId` is missing or blank, the
 *   helper logs `crisp: missing or invalid websiteId` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * const crispScript = crisp({
 * 	websiteId: '1234-abcd',
 * });
 * ```
 *
 * @see {@link https://help.crisp.chat/en/article/how-do-i-install-crisp-live-chat-on-my-website-10wcj3l/} Crisp installation documentation.
 */
export const crisp = function crisp(options: CrispOptions): Script {
	const websiteId = readId(options.websiteId);
	if (websiteId === undefined) {
		return skipMissingId('crisp', 'websiteId', {
			category: 'functionality',
			manifest: crispManifest,
		});
	}

	const { scriptSrc, ...manifestOptions } = options;
	return withScriptUrl(
		resolvedManifestToScript(
			resolveCrispManifest({ ...manifestOptions, websiteId })
		),
		scriptSrc
	);
};
