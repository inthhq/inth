import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId, skipScript } from '../_shared/required-id';
import { trimToUndefined, withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		/** Client that RB2B's account script installs when it runs. */
		reb2b?: unknown;
	}
}

/**
 * RB2B's consent-gated account loader. There is no pre-load queue: the
 * current account script ignores calls queued before it runs.
 */
export const rb2bManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			async: true,
			src: 'https://ddwl4m2hdecbv.cloudfront.net/b/{{keyPath}}/{{keyPath}}.js.gz',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'rb2b',
	vendorDetails: {
		homepageUrl: 'https://www.rb2b.com/',
		legalName: 'GetEmails, LLC',
		name: 'RB2B',
		privacyPolicyUrl: 'https://www.rb2b.com/privacy-policy',
	},
} as const satisfies VendorManifest;

/** Public RB2B account configuration. */
export interface Rb2bOptions {
	/** Account key in reb2b.load on the Script Setup page. */
	accountKey: string;
	/** Supported HTTPS CloudFront or S3 URL with an account segment and filename. */
	scriptUrl?: string;
}

const supportedScriptPrefixes = [
	'https://ddwl4m2hdecbv.cloudfront.net/b/',
	'https://s3-us-west-2.amazonaws.com/b2bjsstore/b/',
	'https://b2bjsstore.s3.us-west-2.amazonaws.com/b/',
];

const isSupportedScriptUrl = function isSupportedScriptUrl(
	scriptUrl: string,
	accountKey: string
): boolean {
	try {
		const normalized = new URL(scriptUrl);
		const prefix = supportedScriptPrefixes.find((supportedPrefix) =>
			normalized.href.startsWith(supportedPrefix)
		);
		if (prefix === undefined) {
			return false;
		}
		const accountPath = normalized.pathname.slice(
			new URL(prefix).pathname.length
		);
		const segmentEnd = accountPath.indexOf('/');
		return (
			segmentEnd > 0 &&
			!accountPath.endsWith('/') &&
			decodeURIComponent(accountPath.slice(0, segmentEnd)) === accountKey
		);
	} catch {
		return false;
	}
};

/**
 * Builds the serializable manifest behind {@link rb2b}.
 */
export const resolveRb2bManifest = function resolveRb2bManifest({
	accountKey,
}: Omit<Rb2bOptions, 'scriptUrl'>): ResolvedManifest {
	return getCompiledManifest(rb2bManifest, {
		keyPath: encodeURIComponent(accountKey),
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'rb2b',
		{
			accountKey: {
				example: '0D7P8HPGQ7O5',
				kind: 'id',
				label: 'Account key',
				pattern: '^[A-Za-z0-9]+$',
				required: true,
			},
		},
		resolveRb2bManifest
	);

/**
 * Loads RB2B after marketing consent, once per page.
 * @param options - Public account key and optional loader URL.
 * @returns A gated script, or a skipped script for an invalid key or loader URL.
 * @remarks RB2B has no documented stop API. Keep reload on revocation enabled.
 * @example rb2b({ accountKey: 'YOUR_RB2B_KEY' });
 * @see https://support.rb2b.com/en/articles/9503690-rb2b-install-guide-for-typescript
 */
export const rb2b = function rb2b(options: Rb2bOptions): Script {
	const accountKey = readId(
		typeof options?.accountKey === 'string' ? options.accountKey : undefined
	);
	if (accountKey === undefined) {
		return skipMissingId('rb2b', 'accountKey', {
			category: 'marketing',
			manifest: rb2bManifest,
		});
	}
	const scriptUrl = trimToUndefined(options.scriptUrl);
	const script = resolvedManifestToScript(resolveRb2bManifest({ accountKey }));
	// The default URL is checked too: URL parsing drops a key of `.` or `..`
	// out of the path, leaving a loader for no account.
	if (!isSupportedScriptUrl(scriptUrl ?? script.src ?? '', accountKey)) {
		return skipScript(
			'rb2b: scriptUrl must use a supported HTTPS CloudFront or S3 prefix and /b/<accountKey>/<filename> path',
			{ category: 'marketing', manifest: rb2bManifest }
		);
	}

	return withScriptUrl(script, scriptUrl);
};
