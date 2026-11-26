import type { Script } from '@inth/sdk/engine';
import { eloquaScript } from '@inth/sdk/manifest-runtime/adapters/oracle-eloqua';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { createScriptReuse } from '../_shared/reuse-script';
import {
	resolveScriptUrl,
	trimToUndefined,
	withScriptUrl,
} from '../_shared/script-url';

declare global {
	interface Window {
		_elqQ?: { push: (...commands: unknown[][]) => unknown };
	}
}

/**
 * Eloqua's asynchronous tracking queue. The Oracle Eloqua adapter in
 * `@inth/sdk` loads it after consent and sends the consent commands.
 */
export const eloquaTrackingManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{ ifUndefined: false, name: '_elqQ', type: 'setGlobal', value: [] },
		{
			queue: '_elqQ',
			type: 'pushToQueue',
			value: ['elqSetSiteId', '{{siteId}}'],
		},
		{
			async: true,
			src: 'https://img.en25.com/i/elqCfg.min.js',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'oracle-eloqua',
	vendorDetails: {
		homepageUrl: 'https://www.oracle.com/cx/marketing/automation/',
		legalName: 'Oracle Corporation',
		name: 'Oracle Eloqua',
		privacyPolicyUrl: 'https://www.oracle.com/legal/privacy/',
	},
} as const satisfies VendorManifest;

/** The same queue, which also turns on first-party cookies for a domain. */
const eloquaFirstPartyManifest = {
	...eloquaTrackingManifest,
	install: [
		...eloquaTrackingManifest.install,
		{
			queue: '_elqQ',
			type: 'pushToQueue',
			value: ['elqUseFirstPartyCookie', '{{firstPartyCookieDomain}}'],
		},
	],
} as const satisfies VendorManifest;

export interface EloquaTrackingOptions {
	/** Eloqua site ID. Use one site/domain configuration per page; reload to change it. */
	siteId: string | number;
	/** First-party tracking hostname. Shared providers must use the same domain. */
	firstPartyCookieDomain?: string;
	/** Consent condition required before loading. @default 'marketing' */
	category?: Script['category'];
	/**
	 * Custom loader URL. Consent commands must synchronously append a matching
	 * pps=41/42 script with the installed siteid. Deferred or unmatched responses
	 * block tracking until reload. A `scriptLoader.sources` or script registry
	 * entry that moves the loader to another URL counts as a custom loader too.
	 */
	scriptUrl?: string;
}

/**
 * The manifest for Eloqua: its queue with the site ID and first-party
 * cookie domain, and the Oracle Eloqua adapter. `siteId` must already be
 * trimmed and non-empty, and `firstPartyCookieDomain` lowercase. The npm
 * helper and the Inth server both build it here.
 */
export const resolveEloquaManifest = function resolveEloquaManifest({
	firstPartyCookieDomain,
	siteId,
}: {
	siteId: string;
	firstPartyCookieDomain?: string;
}): ResolvedManifest {
	return {
		...(firstPartyCookieDomain
			? getCompiledManifest(eloquaFirstPartyManifest, {
					firstPartyCookieDomain,
					siteId,
				})
			: getCompiledManifest(eloquaTrackingManifest, { siteId })),
		adapter: {
			id: 'oracle-eloqua',
			options: firstPartyCookieDomain
				? { firstPartyCookieDomain, siteId }
				: { siteId },
		},
		requires: 4,
	};
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the
 * same resolver; `category` and `scriptUrl` stay npm-only. Marked pure so a
 * bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'eloquaTracking',
		{
			firstPartyCookieDomain: {
				example: 'track.example.com',
				kind: 'hostname',
				label: 'First-party tracking domain',
				required: false,
			},
			siteId: {
				example: '1973398186',
				kind: 'id',
				label: 'Site ID',
				pattern: '^[0-9]{1,20}$',
				required: true,
			},
		},
		resolveEloquaManifest
	);

const reuseEloquaTracking = createScriptReuse<EloquaTrackingOptions>();

export const eloquaTracking = function eloquaTracking(
	options: EloquaTrackingOptions
): Script {
	const category = options?.category ?? 'marketing';
	const siteId = readId(options?.siteId);
	if (!siteId) {
		return skipMissingId('eloquaTracking', 'siteId', {
			category,
			manifest: eloquaTrackingManifest,
		});
	}
	const firstPartyCookieDomain = trimToUndefined(
		options.firstPartyCookieDomain
	)?.toLowerCase();
	const scriptUrl = resolveScriptUrl(
		options.scriptUrl,
		eloquaTrackingManifest.install[2].src
	);
	// Equal options share one script, so its registrations share one
	// consent owner: npm-only, since the Inth server sends one registration.
	return reuseEloquaTracking(
		{ category, firstPartyCookieDomain, scriptUrl, siteId },
		(config) => {
			const { adapter: _adapter, ...manifest } = resolveEloquaManifest({
				firstPartyCookieDomain,
				siteId,
			});
			return eloquaScript(
				{
					...withScriptUrl(resolvedManifestToScript(manifest), scriptUrl),
					category: config.category ?? 'marketing',
				},
				{ firstPartyCookieDomain, siteId }
			);
		}
	);
};
