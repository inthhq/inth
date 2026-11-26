import type { Script } from '@inth/sdk/engine';
import { activeCampaignScript } from '@inth/sdk/manifest-runtime/adapters/activecampaign';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract, runtimeTimestampValue } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { trimToUndefined, withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		prismGlobalObjectAlias?: string;
		pgo?: ((...args: unknown[]) => void) & { q?: IArguments[]; l?: number };
	}
}

/**
 * ActiveCampaign's current pgo snippet with tracking disabled at startup.
 * The ActiveCampaign adapter in `@inth/sdk` sets the tag's `src` once no
 * other tracker owns the page, and allows tracking after the SDK loads.
 */
export const activeCampaignTrackingManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			ifUndefined: false,
			name: 'prismGlobalObjectAlias',
			type: 'setGlobal',
			value: 'pgo',
		},
		{
			name: 'pgo',
			properties: { l: runtimeTimestampValue },
			queue: { property: 'q' },
			type: 'defineStubFunction',
		},
		{
			args: ['setAccount', '{{accountId}}'],
			global: 'pgo',
			type: 'callGlobal',
		},
		{ args: ['setTrackByDefault', false], global: 'pgo', type: 'callGlobal' },
		{
			async: true,
			src: 'https://diffuser-cdn.app-us1.com/diffuser/diffuser.js',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'activecampaign',
	vendorDetails: {
		homepageUrl: 'https://www.activecampaign.com/',
		legalName: 'ActiveCampaign, LLC',
		name: 'ActiveCampaign',
		privacyPolicyUrl: 'https://www.activecampaign.com/legal/privacy-policy',
	},
} as const satisfies VendorManifest;

export interface ActiveCampaignTrackingOptions {
	/** ActiveCampaign account ID from the tracking snippet. */
	accountId: string | number;
	/** Email for future requests. Removing it clears the email field after consent. */
	email?: string;
	/** Consent condition required before loading. @default 'marketing' */
	category?: Script['category'];
	/** Regional or proxied loader URL. Fixed after loading starts on this page. */
	scriptUrl?: string;
}

/**
 * The manifest for ActiveCampaign: the snippet's queue and account, and the
 * ActiveCampaign adapter. `accountId` must already be trimmed and
 * non-empty. The npm helper and the Inth server both build it here.
 */
export const resolveActiveCampaignManifest =
	function resolveActiveCampaignManifest({
		accountId,
	}: {
		accountId: string;
	}): ResolvedManifest {
		return {
			...getCompiledManifest(activeCampaignTrackingManifest, { accountId }),
			adapter: { id: 'activecampaign', options: { accountId } },
			requires: 4,
		};
	};

/**
 * What the Inth server may set for this vendor. The npm helper calls the
 * same resolver; `email`, `category` and `scriptUrl` stay npm-only. Marked
 * pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'activeCampaignTracking',
		{
			accountId: {
				example: '123456',
				kind: 'id',
				label: 'Account ID',
				pattern: '^[0-9]{1,20}$',
				required: true,
			},
		},
		resolveActiveCampaignManifest
	);

/**
 * Loads ActiveCampaign site tracking only after consent.
 * Keep reloadOnConsentRevoked enabled. setTrackByDefault(false) does not
 * revoke an allowTracking call on an already-running tracker.
 * @returns A gated script, or an inactive script for a missing account ID.
 * @example activeCampaignTracking({ accountId: '123456' });
 * @see https://help.activecampaign.com/hc/en-us/articles/360000872064-Site-tracking-and-the-GDPR
 */
export const activeCampaignTracking = function activeCampaignTracking(
	options: ActiveCampaignTrackingOptions
): Script {
	const category = options?.category ?? 'marketing';
	const accountId = readId(options?.accountId);
	if (!accountId) {
		return skipMissingId('activeCampaignTracking', 'accountId', {
			category,
			manifest: activeCampaignTrackingManifest,
		});
	}
	const { adapter: _adapter, ...manifest } = resolveActiveCampaignManifest({
		accountId,
	});
	return activeCampaignScript(
		{
			...withScriptUrl(resolvedManifestToScript(manifest), options.scriptUrl),
			category,
		},
		{ accountId },
		{ email: trimToUndefined(options.email) }
	);
};
