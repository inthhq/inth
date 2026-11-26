import type { Script } from '@inth/sdk/engine';
import {
	assertFullStoryOwner,
	fullStoryEndpoints,
	fullStoryOrgLocale,
	fullStoryScript,
} from '@inth/sdk/manifest-runtime/adapters/fullstory';
import type {
	FullStoryAdapterOptions,
	FullStoryApi,
} from '@inth/sdk/manifest-runtime/adapters/fullstory';

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
import {
	resolveScriptUrl,
	trimToUndefined,
	withScriptUrl,
} from '../_shared/script-url';

export type {
	FullStoryApi,
	FullStoryCall,
} from '@inth/sdk/manifest-runtime/adapters/fullstory';

declare global {
	interface Window {
		FS?: FullStoryApi;
		_fs_org?: string;
		_fs_host?: string;
		_fs_script?: string;
		_fs_capture_on_startup?: boolean;
		_fs_namespace?: string;
	}
}

/**
 * FullStory loader metadata. Bootstrap waits for the mapped consent: the
 * FullStory adapter in `@inth/sdk` installs the `FS` stub and follows
 * consent.
 */
export const fullStoryManifest = {
	...vendorManifestContract,
	category: 'measurement',
	install: [
		{
			async: true,
			attributes: { crossorigin: 'anonymous', 'data-fs-namespace': 'FS' },
			src: 'https://edge.fullstory.com/s/fs.js?org={{orgParam}}',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'fullstory',
	vendorDetails: {
		homepageUrl: 'https://www.fullstory.com/',
		legalName: 'FullStory, Inc.',
		name: 'FullStory',
		privacyPolicyUrl: 'https://www.fullstory.com/legal/privacy-policy/',
	},
} as const satisfies VendorManifest;

/** The same loader for an organization in FullStory's EU region. */
const fullStoryEuManifest = {
	...fullStoryManifest,
	install: [
		{
			...fullStoryManifest.install[0],
			src: 'https://edge.eu1.fullstory.com/s/fs.js?org={{orgParam}}',
		},
	],
} as const satisfies VendorManifest;

export interface FullStoryOptions {
	/** Organization ID supplied by FullStory. */
	orgId: string;
	/** FullStory host. Defaults to the organization's regional FullStory host. */
	host?: string;
	/** Script host/path without a scheme. Defaults to the organization's regional edge. */
	script?: string;
	/** Consent for elements configured as capture with consent. @default false */
	elementConsent?: boolean;
	/** Consent condition required before loading. @default 'measurement' */
	category?: Script['category'];
	/** Exact loader URL override. Blank values use the vendor URL. */
	scriptUrl?: string;
}

/**
 * The manifest for a FullStory organization: `fs.js` from FullStory's edge
 * in the organization's region (the default or EU), and the FullStory
 * adapter with the organization and element consent. The npm helper and
 * the Inth server both build it here. `orgId` must already be trimmed and
 * non-empty.
 */
export const resolveFullStoryManifest = function resolveFullStoryManifest({
	elementConsent = false,
	orgId,
}: Pick<FullStoryOptions, 'elementConsent' | 'orgId'>): ResolvedManifest {
	const options: FullStoryAdapterOptions = { elementConsent, orgId };
	return {
		...getCompiledManifest(
			fullStoryOrgLocale(orgId) === 'eu1'
				? fullStoryEuManifest
				: fullStoryManifest,
			{ orgParam: encodeURIComponent(orgId) }
		),
		adapter: { id: 'fullstory', options: { ...options } },
		requires: 4,
	};
};

/**
 * What the Inth server may set for FullStory: an organization in the
 * default or EU region, and element consent. A host, script path or loader
 * URL of the site's own and the category stay npm-only.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'fullStory',
		{
			elementConsent: {
				default: false,
				kind: 'boolean',
				label: 'Consent for elements set to capture with consent',
			},
			orgId: {
				example: 'o-1ABC2D-na1',
				kind: 'id',
				label: 'Organization ID',
				pattern: '^(?:[A-Za-z0-9]{1,32}|o-[A-Za-z0-9]{1,32}-(?:na1|eu1))$',
				required: true,
			},
		},
		resolveFullStoryManifest
	);

/** The options with the host, script path and loader URL they resolve to. */
interface ResolvedFullStoryOptions extends FullStoryOptions {
	host: string;
	script: string;
	scriptUrl: string;
}

const resolveOptions = (
	options: FullStoryOptions,
	orgId: string
): ResolvedFullStoryOptions => {
	const { host, script } = fullStoryEndpoints(
		orgId,
		trimToUndefined(options.host),
		trimToUndefined(options.script)
	);
	return {
		...options,
		host,
		orgId,
		script,
		scriptUrl: resolveScriptUrl(
			options.scriptUrl,
			`https://${script}?org=${encodeURIComponent(orgId)}`
		),
	};
};

/** The manifest's script, loading from the site's resolved URL. */
const baseScript = (options: ResolvedFullStoryOptions): Script => {
	const { adapter: _adapter, ...manifest } = resolveFullStoryManifest(options);
	const script = resolvedManifestToScript(manifest);
	return {
		// A host, script path or loader URL of the site's own: npm-only.
		...withScriptUrl(script, options.scriptUrl),
		category: options.category ?? 'measurement',
	};
};

const reuseFullStory = createScriptReuse<ResolvedFullStoryOptions>();

const createFullStory = function createFullStory(
	options: ResolvedFullStoryOptions
): Script {
	const { host, orgId, script } = options;
	return fullStoryScript(
		baseScript(options),
		{ elementConsent: options.elementConsent ?? false, orgId },
		{ endpoints: { host, script }, registrations: getScriptRegistrations }
	);
};

/**
 * Starts FullStory after consent and shuts down capture on revoke.
 * Capture is always disabled at initialization, including in-flight revocation.
 * @param options - FullStory organization, endpoint and element consent.
 * @returns A gated script, or an inactive script for a missing organization ID.
 * @throws {Error} If FS belongs to another installer or recorder endpoints have changed. Reload the page first.
 * @example fullStory({ orgId: 'YOUR_ORG_ID' });
 * @see https://developer.fullstory.com/browser/getting-started/
 */
export const fullStory = function fullStory(options: FullStoryOptions): Script {
	const orgId = readId(options?.orgId);
	if (!orgId) {
		return skipMissingId('fullStory', 'orgId', {
			category: options?.category ?? 'measurement',
			manifest: fullStoryManifest,
		});
	}
	const resolved = resolveOptions(options, orgId);
	assertFullStoryOwner(
		{ src: resolved.scriptUrl },
		{ orgId },
		{ host: resolved.host, script: resolved.script }
	);
	return reuseFullStory(resolved, createFullStory);
};
