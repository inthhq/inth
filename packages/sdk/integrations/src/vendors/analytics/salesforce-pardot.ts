import type { Script } from '@inth/sdk/engine';
import { pardotConsentScript } from '@inth/sdk/manifest-runtime/adapters/salesforce-pardot';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { isHostname } from '../_shared/hostname';
import { readId, skipMissingId, skipScript } from '../_shared/required-id';
import { createScriptReuse } from '../_shared/reuse-script';
import { resolveScriptUrl, withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		piAId?: string;
		piCId?: string;
		piHostname?: string;
		piDomain?: string;
		pdt?: ((...args: unknown[]) => void) & { cq?: IArguments[] };
	}
}

/**
 * Account Engagement tracking with its consent queue, from the tracker
 * hostname: the site's own tracker domain, or Pardot's. The Salesforce
 * Pardot adapter in `@inth/sdk` grants tracking once the SDK loads.
 */
export const pardotTrackingManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			ifUndefined: false,
			name: 'piAId',
			type: 'setGlobal',
			value: '{{piAId}}',
		},
		{
			ifUndefined: false,
			name: 'piCId',
			type: 'setGlobal',
			value: '{{piCId}}',
		},
		{
			ifUndefined: false,
			name: 'piDomain',
			type: 'setGlobal',
			value: '{{piHostname}}',
		},
		{
			ifUndefined: false,
			name: 'pdt',
			queue: { property: 'cq' },
			type: 'defineStubFunction',
		},
		{
			args: ['create', '{{piAId}}', '{{piCId}}', '{{piHostname}}'],
			global: 'pdt',
			type: 'callGlobal',
		},
		{ args: ['hideConsentBanner', null], global: 'pdt', type: 'callGlobal' },
		{ args: ['setOptIn', false], global: 'pdt', type: 'callGlobal' },
		{
			async: true,
			src: 'https://{{piHostname}}/pdt.js?aid={{piAId}}',
			type: 'loadScript',
		},
	],
	onConsentDenied: [
		{ args: ['revokeConsent'], global: 'pdt', type: 'callGlobal' },
	],
	onLoadGranted: [
		{ args: ['setOptIn', true], global: 'pdt', type: 'callGlobal' },
		{ args: ['sendPageView'], global: 'pdt', type: 'callGlobal' },
	],
	persistAfterConsentRevoked: true,
	vendor: 'salesforce-pardot',
	vendorDetails: {
		homepageUrl: 'https://www.salesforce.com/marketing/b2b-automation/',
		legalName: 'Salesforce, Inc.',
		name: 'Salesforce Account Engagement',
		privacyPolicyUrl: 'https://www.salesforce.com/company/privacy/',
	},
} as const satisfies VendorManifest;

/**
 * Account Engagement's classic tracking snippet: the account globals, then
 * pd.js from Pardot's own host, with no consent API.
 */
export const pardotClassicManifest = {
	...vendorManifestContract,
	category: '{{category}}',
	install: [
		{
			ifUndefined: false,
			name: 'piAId',
			type: 'setGlobal',
			value: '{{piAId}}',
		},
		{
			ifUndefined: false,
			name: 'piCId',
			type: 'setGlobal',
			value: '{{piCId}}',
		},
		{
			ifUndefined: false,
			name: 'piHostname',
			type: 'setGlobal',
			value: '{{piHostname}}',
		},
		{ async: true, src: 'https://pi.pardot.com/pd.js', type: 'loadScript' },
	],
	vendor: pardotTrackingManifest.vendor,
	vendorDetails: pardotTrackingManifest.vendorDetails,
} as const satisfies VendorManifest;

export interface PardotTrackingOptions {
	/** Account ID from the tracking snippet. */
	piAId: string | number;
	/** Campaign ID from the tracking snippet. */
	piCId: string | number;
	/** Tracker hostname, required for the consent API. */
	piDomain?: string;
	/** Classic tracker hostname. @default 'pi.pardot.com' */
	piHostname?: string;
	/** The consent API must be enabled in Account Engagement. @default 'consent' */
	mode?: 'consent' | 'classic';
	/** Consent condition required before loading. @default 'marketing' */
	category?: Script['category'];
	/** Custom or proxied loader URL. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest for {@link pardotTracking} in classic
 * mode. The IDs must already be positive integers and `piHostname` a
 * lowercase hostname.
 */
export const resolvePardotClassicManifest =
	function resolvePardotClassicManifest({
		piAId,
		piCId,
		piHostname = 'pi.pardot.com',
		category = 'marketing',
	}: Pick<
		PardotTrackingOptions,
		'piAId' | 'piCId' | 'piHostname' | 'category'
	>): ResolvedManifest {
		return getCompiledManifest(pardotClassicManifest, {
			category,
			piAId: Number(piAId),
			piCId: Number(piCId),
			piHostname,
		});
	};

/**
 * Builds the serializable manifest for {@link pardotTracking} in consent
 * mode: the consent queue on `piHostname`, and the Salesforce Pardot
 * adapter. The IDs must already be positive integers and `piHostname` a
 * lowercase hostname. The npm helper and the Inth server both build it
 * here.
 */
export const resolvePardotConsentManifest =
	function resolvePardotConsentManifest({
		piAId,
		piCId,
		piHostname,
	}: {
		piAId: string | number;
		piCId: string | number;
		piHostname: string;
	}): ResolvedManifest {
		return {
			...getCompiledManifest(pardotTrackingManifest, {
				piAId: Number(piAId),
				piCId: Number(piCId),
				piHostname,
			}),
			adapter: { id: 'salesforce-pardot', options: {} },
			requires: 4,
		};
	};

/**
 * What the Inth server may set for this vendor, in either mode. Without a
 * mode it is classic mode, which loads `pd.js` from Pardot's own host and
 * reads the tracker hostname, `pi.pardot.com` unless set. Consent mode
 * loads `pdt.js` from the tracker hostname, so it needs one set, as the
 * helper needs `piDomain`. `category` and `scriptUrl` stay npm-only.
 * Marked pure so a bundler drops it from an npm bundle that never reads
 * it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'pardotTracking',
		{
			mode: {
				default: 'classic',
				kind: 'enum',
				label: 'Tracking mode',
				values: ['consent', 'classic'],
			},
			piAId: {
				example: '123456',
				kind: 'id',
				label: 'Account ID',
				pattern: '^[1-9][0-9]{0,14}$',
				required: true,
			},
			piCId: {
				example: '654321',
				kind: 'id',
				label: 'Campaign ID',
				pattern: '^[1-9][0-9]{0,14}$',
				required: true,
			},
			piHostname: {
				example: 'go.example.com',
				kind: 'hostname',
				label: 'Tracker hostname',
				required: false,
			},
		},
		({ mode, piAId, piCId, piHostname }) =>
			mode === 'consent' && piHostname !== undefined
				? resolvePardotConsentManifest({ piAId, piCId, piHostname })
				: resolvePardotClassicManifest({ piAId, piCId, piHostname }),
		({ mode, piHostname }) =>
			mode === 'consent' && piHostname === undefined
				? "'piHostname' is required in consent mode"
				: undefined
	);

const reusePardotTracking = createScriptReuse<PardotTrackingOptions>();

/**
 * Loads Account Engagement after the mapped consent is granted.
 * @param options - Account, campaign and tracker configuration.
 * @returns A gated script, or an inactive script for missing configuration.
 * @example pardotTracking({ piAId: '123456', piCId: '654321', piDomain: 'go.example.com' });
 * @see https://developer.salesforce.com/docs/marketing/pardot/guide/tracking-and-consent-getting-started.html
 */
export const pardotTracking = function pardotTracking(
	options: PardotTrackingOptions
): Script {
	const category = options?.category ?? 'marketing';
	const skipped = { category, manifest: pardotTrackingManifest };
	const piAId = readId(options?.piAId);
	if (!piAId) {
		return skipMissingId('pardotTracking', 'piAId', skipped);
	}
	const piCId = readId(options.piCId);
	if (!piCId) {
		return skipMissingId('pardotTracking', 'piCId', skipped);
	}
	if (
		![piAId, piCId].every(
			(id) =>
				/^\d+$/u.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0
		)
	) {
		return skipScript(
			'pardotTracking: account and campaign IDs must be positive integers from the tracking snippet',
			skipped
		);
	}
	const mode = options.mode ?? 'consent';
	if (mode !== 'consent' && mode !== 'classic') {
		return skipScript(
			"pardotTracking: mode must be 'consent' or 'classic'",
			skipped
		);
	}
	const domain = readId(
		mode === 'classic'
			? (options.piHostname ?? 'pi.pardot.com')
			: options.piDomain
	)?.toLowerCase();
	if (!domain) {
		return skipMissingId('pardotTracking', 'piDomain', skipped);
	}
	if (!isHostname(domain)) {
		return skipScript(
			'pardotTracking: tracker domain must be a hostname',
			skipped
		);
	}
	if (mode === 'classic') {
		return withScriptUrl(
			resolvedManifestToScript(
				resolvePardotClassicManifest({
					category,
					piAId,
					piCId,
					piHostname: domain,
				})
			),
			options.scriptUrl
		);
	}
	const scriptUrl = resolveScriptUrl(
		options.scriptUrl,
		`https://${domain}/pdt.js?aid=${Number(piAId)}`
	);
	// Equal options share one script, so its registrations share one
	// consent cycle: npm-only, since the Inth server sends one registration.
	return reusePardotTracking(
		{
			category,
			piAId: Number(piAId),
			piCId: Number(piCId),
			piDomain: domain,
			scriptUrl,
		},
		(config) => {
			const { adapter: _adapter, ...manifest } = resolvePardotConsentManifest({
				piAId,
				piCId,
				piHostname: domain,
			});
			return pardotConsentScript({
				...withScriptUrl(resolvedManifestToScript(manifest), config.scriptUrl),
				category: config.category ?? 'marketing',
			});
		}
	);
};
