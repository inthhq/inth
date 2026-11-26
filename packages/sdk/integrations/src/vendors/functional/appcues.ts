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
		AppcuesSettings?: Record<string, unknown>;
		Appcues?: {
			reset?: () => void;
			identify?: (userId: string, properties?: Record<string, unknown>) => void;
			group?: (groupId: string, properties?: Record<string, unknown>) => void;
			track?: (eventName: string, properties?: Record<string, unknown>) => void;
			page?: () => void;
		};
	}
}

/** Appcues browser SDK, gated on experience consent. */
export const appcuesManifest = {
	...vendorManifestContract,
	category: 'experience',
	install: [
		{
			ifUndefined: false,
			name: 'AppcuesSettings',
			type: 'setGlobal',
			value: '{{settings}}',
		},
		{
			async: true,
			src: 'https://fast.appcues.com/{{accountPath}}.js',
			type: 'loadScript',
		},
	],
	onConsentDenied: [{ global: 'Appcues', method: 'reset', type: 'callGlobal' }],
	vendor: 'appcues',
	vendorDetails: {
		homepageUrl: 'https://www.appcues.com/',
		legalName: 'Appcues, Inc.',
		name: 'Appcues',
		privacyPolicyUrl: 'https://www.appcues.com/privacy',
	},
} as const satisfies VendorManifest;

/** {@link appcuesManifest} for an account in the EU data region. */
export const appcuesEuManifest = {
	...appcuesManifest,
	install: [
		appcuesManifest.install[0],
		{
			async: true,
			src: 'https://fast.eu.appcues.com/{{accountPath}}.js',
			type: 'loadScript',
		},
	],
} as const satisfies VendorManifest;

export interface AppcuesOptions {
	/** Account ID from the Appcues installation snippet. */
	accountId: string;
	/** Data region for the account. @default 'us' */
	region?: 'us' | 'eu';
	/** JSON-serializable Appcues settings. @default { enableURLDetection: true } */
	settings?: Record<string, unknown>;
	/** Custom or proxied account loader URL. */
	scriptUrl?: string;
	/**
	 * Runs synchronously once the account loader exposes Appcues, with consent.
	 * Read the current visitor here before calling identify, group or track.
	 * Revoked or removed loaders do not notify; a new grant can notify again.
	 */
	onReady?: () => void;
}

/**
 * Builds the serializable manifest behind {@link appcues}. `accountId` must
 * already be trimmed and non-empty.
 */
export const resolveAppcuesManifest = function resolveAppcuesManifest({
	accountId,
	region,
	settings,
}: Pick<
	AppcuesOptions,
	'accountId' | 'region' | 'settings'
>): ResolvedManifest {
	return getCompiledManifest(
		region === 'eu' ? appcuesEuManifest : appcuesManifest,
		{
			accountPath: encodeURIComponent(accountId),
			settings: { enableURLDetection: true, ...settings },
		}
	);
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `scriptUrl` and `onReady` stay npm-only. Marked pure so a bundler
 * drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'appcues',
		{
			accountId: {
				example: '12345',
				kind: 'id',
				label: 'Account ID',
				pattern: '^[0-9]+$',
				required: true,
			},
			region: {
				default: 'us',
				kind: 'enum',
				label: 'Data region',
				values: ['us', 'eu'],
			},
			settings: {
				fields: {
					enableURLDetection: {
						default: true,
						kind: 'boolean',
						label: 'Detect page changes from the URL',
					},
					skipAMD: {
						default: false,
						kind: 'boolean',
						label: 'Skip the AMD loader check',
					},
				},
				kind: 'object',
				label: 'Settings',
				required: false,
			},
		},
		resolveAppcuesManifest
	);

/**
 * Loads Appcues after experience consent and resets its user on revocation.
 *
 * Keep `reloadOnConsentRevoked` enabled. Reset clears user state but does not
 * stop all SDK listeners or cancel a script download already in flight.
 *
 * @returns A consent-gated Appcues script, or a skipped script for a blank ID.
 * @example
 * appcues({ accountId: 'YOUR_APPCUES_ID' });
 * @see https://docs.appcues.com/install-appcues-web/install-the-appcues-sdk
 */
export const appcues = function appcues(options: AppcuesOptions): Script {
	const accountId = readId(options?.accountId);
	if (accountId === undefined) {
		return skipMissingId('appcues', 'accountId', {
			category: 'experience',
			manifest: appcuesManifest,
		});
	}
	const script = withScriptUrl(
		resolvedManifestToScript(
			resolveAppcuesManifest({
				accountId,
				region: options.region,
				settings: options.settings,
			})
		),
		options.scriptUrl
	);
	const { onReady } = options;
	if (onReady) {
		const { onLoad } = script;
		// Core checks current consent and ignores detached loader completions.
		// Keep visitor callbacks out of the cached manifest and global queues.
		// oxlint-disable-next-line integrations/no-vendor-callbacks -- npm-only: calls the site's onReady function
		script.onLoad = (info) => {
			onLoad?.(info);
			if (info.hasConsent && window.Appcues) {
				onReady();
			}
		};
	}
	return script;
};
