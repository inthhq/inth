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
		uetq: unknown[] | undefined;
	}
}

/**
 * Microsoft UET vendor manifest.
 *
 * Loads in consent mode and manages consent via the UET push API:
 * `window.uetq.push('consent', 'default'|'update', consentState)`.
 */
export const microsoftUetManifest = {
	...vendorManifestContract,
	afterLoad: [
		{
			args: [
				{
					enableAutoSpaTracking: true,

					ti: '{{id}}',
				},
			],
			assignTo: 'uetq',
			constructor: 'UET',
			copyAssignedValueToArgProperty: 'q',

			type: 'constructGlobal',
		},
		{
			args: ['pageLoad'],

			global: 'uetq',
			method: 'push',
			type: 'callGlobal',
		},
	],
	alwaysLoad: true,
	bootstrap: [
		{
			ifUndefined: true,

			name: 'uetq',
			type: 'setGlobal',
			value: [],
		},
	],
	category: 'marketing',
	install: [
		{
			async: true,

			src: 'https://bat.bing.com/bat.js',
			type: 'loadScript',
		},
	],
	onBeforeLoadDenied: [
		{
			args: ['consent', 'default', { ad_storage: 'denied' }],

			global: 'uetq',
			method: 'push',
			type: 'callGlobal',
		},
	],
	onBeforeLoadGranted: [
		{
			args: ['consent', 'default', { ad_storage: 'granted' }],

			global: 'uetq',
			method: 'push',
			type: 'callGlobal',
		},
	],
	onConsentDenied: [
		{
			args: ['consent', 'update', { ad_storage: 'denied' }],

			global: 'uetq',
			method: 'push',
			type: 'callGlobal',
		},
	],
	onConsentGranted: [
		{
			args: ['consent', 'update', { ad_storage: 'granted' }],

			global: 'uetq',
			method: 'push',
			type: 'callGlobal',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'microsoft-uet',
	vendorDetails: {
		homepageUrl: 'https://ads.microsoft.com/',
		legalName: 'Microsoft Corporation',
		name: 'Microsoft Advertising',
		privacyPolicyUrl: 'https://www.microsoft.com/privacy/privacystatement',
	},
} as const satisfies VendorManifest;

export interface MicrosoftUetOptions {
	/**
	 * Your Microsoft UET ID
	 * @example `123456789012345`
	 */
	id: string;

	/** Microsoft UET loader URL. */
	scriptSrc?: string;
}

/**
 * Builds the serializable manifest behind {@link microsoftUet}. `id` must
 * already be a trimmed, non-empty UET tag ID.
 */
export const resolveMicrosoftUetManifest =
	function resolveMicrosoftUetManifest({
		id,
	}: Omit<MicrosoftUetOptions, 'scriptSrc'>): ResolvedManifest {
		return getCompiledManifest(microsoftUetManifest, { id });
	};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'microsoftUet',
		{
			id: {
				example: '343003931',
				kind: 'id',
				label: 'UET tag ID',
				pattern: '^[0-9]+$',
				required: true,
			},
		},
		resolveMicrosoftUetManifest
	);

/**
 * Microsoft UET Script
 * This script loads in consent mode and stays persistent because UET can opt
 * into and out of tracking based on consent.
 *
 * @remarks When `id` is missing or blank, the
 *   helper logs `microsoftUet: missing or invalid id` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * const microsoftUetScript = microsoftUet({
 *   id: '123456789012345',
 * });
 * ```
 *
 * @see https://learn.microsoft.com/en-us/advertising/guides/universal-event-tracking?view=bingads-13
 */
export const microsoftUet = function microsoftUet({
	id,
	scriptSrc,
}: MicrosoftUetOptions): Script {
	const normalizedId = readId(id);
	if (normalizedId === undefined) {
		return skipMissingId('microsoftUet', 'id', {
			category: 'marketing',
			manifest: microsoftUetManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(resolveMicrosoftUetManifest({ id: normalizedId })),
		scriptSrc
	);
};
