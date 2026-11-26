import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

interface ClaydarClient {
	giveCookieConsent?: () => void;
	denyCookieConsent?: () => void;
	push?: (command: unknown) => unknown;
}

declare global {
	interface Window {
		Claydar?: ClaydarClient;
	}
}

/**
 * Clay web intent loader, at the end of body. Marketing consent gates its
 * complete dependency chain.
 */
export const clayManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			async: true,
			src: 'https://static.claydar.com/init.v1.js?id={{siteParam}}',
			type: 'loadScript',
		},
	],
	onConsentDenied: [
		{ queue: 'Claydar', type: 'pushToQueue', value: ['denyCookieConsent'] },
		{ global: 'Claydar', method: 'denyCookieConsent', type: 'callGlobal' },
	],
	onConsentGranted: [
		{ queue: 'Claydar', type: 'pushToQueue', value: ['giveCookieConsent'] },
		{ global: 'Claydar', method: 'giveCookieConsent', type: 'callGlobal' },
	],
	onLoadDenied: [
		{ queue: 'Claydar', type: 'pushToQueue', value: ['denyCookieConsent'] },
		{ global: 'Claydar', method: 'denyCookieConsent', type: 'callGlobal' },
	],
	onLoadGranted: [
		{ queue: 'Claydar', type: 'pushToQueue', value: ['giveCookieConsent'] },
		{ global: 'Claydar', method: 'giveCookieConsent', type: 'callGlobal' },
	],
	persistAfterConsentRevoked: true,
	target: 'body',
	vendor: 'clay',
	vendorDetails: {
		homepageUrl: 'https://www.clay.com/',
		legalName: 'Clay Labs Inc.',
		name: 'Clay',
		privacyPolicyUrl: 'https://www.clay.com/privacy',
	},
} as const satisfies VendorManifest;

/** Configuration copied from Clay's Web intent installation snippet. */
export interface ClayOptions {
	/** Public site ID from the loader's id query parameter. */
	siteId: string;
	/** Override URL. Keep the id query parameter because Clay reads its own src. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link clay}. `siteId` must
 * already be trimmed and non-empty.
 */
export const resolveClayManifest = function resolveClayManifest({
	siteId,
}: Pick<ClayOptions, 'siteId'>): ResolvedManifest {
	return getCompiledManifest(clayManifest, {
		siteParam: encodeURIComponent(siteId),
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `scriptUrl` stays npm-only. Marked pure so a bundler drops it
 * from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'clay',
		{
			siteId: {
				example: 'a1b2c3d4',
				kind: 'id',
				label: 'Site ID',
				pattern: '^[A-Za-z0-9_-]+$',
				required: true,
			},
		},
		resolveClayManifest
	);

/**
 * Loads Clay only after marketing consent.
 * @param options - Public site ID and optional loader override.
 * @returns A consent-gated Clay script, or a skipped script for an invalid ID.
 * @remarks Keep the default reload on revocation. Clay has no tracking stop API.
 * @example clay({ siteId: 'YOUR_SITE_ID' });
 * @see https://university.clay.com/docs/website-tracking
 */
export const clay = function clay(options: ClayOptions): Script {
	const siteId =
		typeof options?.siteId === 'string' ? readId(options.siteId) : undefined;
	if (siteId === undefined) {
		return skipMissingId('clay', 'siteId', {
			category: 'marketing',
			manifest: clayManifest,
		});
	}
	return withScriptUrl(
		resolvedManifestToScript(resolveClayManifest({ siteId })),
		options.scriptUrl
	);
};
