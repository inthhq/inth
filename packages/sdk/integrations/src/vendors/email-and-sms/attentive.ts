import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId, skipScript } from '../_shared/required-id';
import { createScriptReuse } from '../_shared/reuse-script';
import { withScriptUrl } from '../_shared/script-url';

/** Attentive's tag at the end of body, loaded only after consent. */
export const attentiveTagManifest = {
	...vendorManifestContract,
	category: '{{category}}',
	install: [
		{
			async: true,
			src: 'https://cdn.attn.tv/{{sitePath}}/dtag.js',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	target: 'body',
	vendor: 'attentive',
	vendorDetails: {
		homepageUrl: 'https://www.attentive.com/',
		legalName: 'Attentive Mobile Inc.',
		name: 'Attentive',
		privacyPolicyUrl: 'https://www.attentive.com/legal/privacy',
	},
} as const satisfies VendorManifest;

export interface AttentiveTagOptions {
	/** Site slug supplied by Attentive, without the domain or /dtag.js suffix. */
	siteSlug: string;
	/** Consent condition required before loading. @default 'marketing' */
	category?: Script['category'];
	/** Exact tag URL supplied by Attentive or a proxy. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link attentiveTag}. `siteSlug`
 * must already be trimmed and non-empty.
 */
export const resolveAttentiveTagManifest =
	function resolveAttentiveTagManifest({
		siteSlug,
		category = 'marketing',
	}: Pick<AttentiveTagOptions, 'siteSlug' | 'category'>): ResolvedManifest {
		return getCompiledManifest(attentiveTagManifest, {
			category,
			sitePath: encodeURIComponent(siteSlug),
		});
	};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `category` and `scriptUrl` stay npm-only. Marked pure so a
 * bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'attentiveTag',
		{
			siteSlug: {
				example: 'acmestore',
				kind: 'id',
				label: 'Site slug',
				pattern: '^[A-Za-z0-9_-]+$',
				required: true,
			},
		},
		resolveAttentiveTagManifest
	);

const reuseAttentiveTag = createScriptReuse<AttentiveTagOptions>();

const createAttentiveTag = function createAttentiveTag(
	options: AttentiveTagOptions
): Script {
	return withScriptUrl(
		resolvedManifestToScript(
			resolveAttentiveTagManifest({
				category: options.category,
				siteSlug: String(options.siteSlug).trim(),
			})
		),
		options.scriptUrl
	);
};

/**
 * Loads Attentive's tag at the end of body after consent.
 * Keep reloadOnConsentRevoked enabled. Removing the tag does not stop the SDK.
 * The first permitted tag stays on this page to avoid duplicate installation.
 * Withdrawal reloads into a page where the stored denial blocks the whole tag.
 * @returns A gated script, or an inactive script for a missing or invalid slug.
 * @example attentiveTag({ siteSlug: 'YOUR_SITE' });
 * @see https://help.attentive.com/hc/en-us/articles/10905920909460-The-Attentive-tag
 */
export const attentiveTag = function attentiveTag(
	options: AttentiveTagOptions
): Script {
	const siteSlug = readId(options?.siteSlug);
	const skipped = {
		category: options?.category ?? 'marketing',
		manifest: attentiveTagManifest,
	};
	if (!siteSlug) {
		return skipMissingId('attentiveTag', 'siteSlug', skipped);
	}
	if (!/^[\w-]+$/u.test(siteSlug)) {
		return skipScript(
			'attentiveTag: invalid siteSlug, use the single site slug from Attentive',
			skipped
		);
	}
	return reuseAttentiveTag(options, createAttentiveTag);
};
