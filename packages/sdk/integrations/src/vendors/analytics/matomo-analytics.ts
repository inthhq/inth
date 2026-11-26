import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { skipScript } from '../_shared/required-id';
import {
	joinUrlPath,
	stripTrailingSlashes,
	trimToUndefined,
	withScriptUrl,
} from '../_shared/script-url';

declare global {
	interface Window {
		_paq?: unknown[];
	}
}

const stripProtocol = function stripProtocol(value: string): string {
	if (value.startsWith('https://')) {
		return value.slice('https://'.length);
	}

	if (value.startsWith('http://')) {
		return value.slice('http://'.length);
	}

	return value;
};

const resolveMatomoOrigin = function resolveMatomoOrigin(
	options: MatomoAnalyticsOptions
): string | undefined {
	if (options.matomoUrl) {
		return stripTrailingSlashes(options.matomoUrl);
	}

	if (options.cloudId) {
		const cleanedCloudId = stripTrailingSlashes(stripProtocol(options.cloudId));
		if (cleanedCloudId.endsWith('.matomo.cloud')) {
			return `https://${cleanedCloudId}`;
		}

		return `https://cdn.matomo.cloud/${cleanedCloudId}`;
	}

	return undefined;
};

interface MatomoManifestOptions {
	/**
	 * Load `matomo.js` from Matomo Cloud's CDN. Otherwise the npm helper's
	 * self-hosted script URL fills the step.
	 */
	cloud: boolean;
	enableConsentMode: boolean;
	consentInitiallyGiven: boolean;
	enableLinkTracking: boolean;
	disableCookies: boolean;
	trackPageView: boolean;
}

interface MatomoGrantedHooks {
	onBeforeLoadGranted: VendorManifest['onBeforeLoadGranted'];
	onBeforeLoadDenied: VendorManifest['onBeforeLoadDenied'];
	onConsentGranted: VendorManifest['onConsentGranted'];
}

const buildInstallSteps = function buildInstallSteps(
	options: MatomoManifestOptions
): VendorManifest['install'] {
	const install: VendorManifest['install'] = [
		{
			ifUndefined: true,
			name: '_paq',
			type: 'setGlobal',
			value: [],
		},
		{
			queue: '_paq',
			type: 'pushToQueue',
			value: ['setTrackerUrl', '{{trackerUrl}}'],
		},
		{
			queue: '_paq',
			type: 'pushToQueue',
			value: ['setSiteId', '{{siteId}}'],
		},
	];

	if (options.enableLinkTracking) {
		install.push({
			queue: '_paq',
			type: 'pushToQueue',
			value: ['enableLinkTracking'],
		});
	}

	if (options.disableCookies) {
		install.push({
			queue: '_paq',
			type: 'pushToQueue',
			value: ['disableCookies'],
		});
	}

	if (options.enableConsentMode && !options.consentInitiallyGiven) {
		install.push({
			queue: '_paq',
			type: 'pushToQueue',
			value: ['requireConsent'],
		});
	}

	if (options.trackPageView && !options.enableConsentMode) {
		install.push({
			queue: '_paq',
			type: 'pushToQueue',
			value: ['trackPageView'],
		});
	}

	if (options.cloud) {
		install.push({
			async: true,
			src: 'https://cdn.matomo.cloud/{{cloudId}}/matomo.js',
			type: 'loadScript',
		});
	} else {
		install.push({
			async: true,
			// oxlint-disable-next-line integrations/fixed-script-host -- npm-only: a self-hosted Matomo serves matomo.js from the site's own server
			src: '{{scriptUrl}}',
			type: 'loadScript',
		});
	}

	return install;
};

const buildGrantedHooks = function buildGrantedHooks(
	options: MatomoManifestOptions
): MatomoGrantedHooks {
	const onBeforeLoadGranted: VendorManifest['onBeforeLoadGranted'] = [];
	const onBeforeLoadDenied: VendorManifest['onBeforeLoadDenied'] = [];
	if (options.enableConsentMode) {
		onBeforeLoadGranted.push({
			queue: '_paq',
			type: 'pushToQueue',
			value: ['setConsentGiven'],
		});
	}
	if (options.trackPageView && options.enableConsentMode) {
		onBeforeLoadGranted.push({
			queue: '_paq',
			type: 'pushToQueue',
			value: ['trackPageView'],
		});
	}
	// `given` skips the up-front `requireConsent`, so a visitor without
	// measurement consent still needs it before matomo.js starts tracking.
	if (options.enableConsentMode && options.consentInitiallyGiven) {
		onBeforeLoadDenied.push({
			queue: '_paq',
			type: 'pushToQueue',
			value: ['requireConsent'],
		});
	}

	const onConsentGranted: VendorManifest['onConsentGranted'] = [];
	if (options.enableConsentMode) {
		onConsentGranted.push({
			queue: '_paq',
			type: 'pushToQueue',
			value: ['setConsentGiven'],
		});

		if (options.trackPageView) {
			onConsentGranted.push({
				queue: '_paq',
				type: 'pushToQueue',
				value: ['trackPageView'],
			});
		}
	}

	return {
		onBeforeLoadDenied,
		onBeforeLoadGranted,
		onConsentGranted,
	};
};

const buildDeniedHooks = function buildDeniedHooks(
	options: MatomoManifestOptions
): VendorManifest['onConsentDenied'] {
	const onConsentDenied: VendorManifest['onConsentDenied'] = [];
	if (options.enableConsentMode) {
		onConsentDenied.push({
			queue: '_paq',
			type: 'pushToQueue',
			value: ['forgetConsentGiven'],
		});
	}

	return onConsentDenied;
};

const createMatomoAnalyticsManifest = function createMatomoAnalyticsManifest(
	options: MatomoManifestOptions
): VendorManifest {
	const { onBeforeLoadDenied, onBeforeLoadGranted, onConsentGranted } =
		buildGrantedHooks(options);
	let alwaysLoad: true | undefined;
	let persistAfterConsentRevoked: true | undefined;
	if (options.enableConsentMode) {
		alwaysLoad = true;
		persistAfterConsentRevoked = true;
	}

	return {
		...vendorManifestContract,
		alwaysLoad,
		category: 'measurement',
		install: buildInstallSteps(options),
		onBeforeLoadDenied,
		onBeforeLoadGranted,
		onConsentDenied: buildDeniedHooks(options),
		onConsentGranted,
		persistAfterConsentRevoked,
		vendor: 'matomo-analytics',
		vendorDetails: {
			homepageUrl: 'https://matomo.org/',
			legalName: 'InnoCraft Limited',
			name: 'Matomo',
			privacyPolicyUrl: 'https://matomo.org/privacy-policy/',
		},
	};
};

export const matomoAnalyticsManifest = createMatomoAnalyticsManifest({
	cloud: true,
	consentInitiallyGiven: false,
	disableCookies: false,
	enableConsentMode: false,
	enableLinkTracking: false,
	trackPageView: true,
});

export interface MatomoAnalyticsOptions {
	/** Your Matomo site ID. */
	siteId?: string | number;
	/** Your Matomo base URL, for example `https://analytics.example.com`. */
	matomoUrl?: string;
	/** Your Matomo Cloud identifier, for example `my-site.matomo.cloud`. */
	cloudId?: string;
	/** Optional explicit tracker endpoint override. */
	trackerUrl?: string;
	/** Optional explicit script URL override. */
	scriptUrl?: string;
	/** Queue `enableLinkTracking`. */
	enableLinkTracking?: boolean;
	/** Queue `disableCookies`. */
	disableCookies?: boolean;
	/** Queue an initial `trackPageView`. */
	trackPageView?: boolean;
	/**
	 * Enables Matomo's consent API and loads matomo.js before measurement
	 * consent. `required` queues `requireConsent` first. `given` does not, and
	 * queues `setConsentGiven` only when the visitor has measurement consent
	 * as the script loads; otherwise it queues `requireConsent`.
	 */
	defaultConsent?: 'required' | 'given';
}

/** Matomo Cloud settings: the account host replaces a self-hosted URL. */
export type MatomoCloudOptions = Pick<
	MatomoAnalyticsOptions,
	| 'defaultConsent'
	| 'disableCookies'
	| 'enableLinkTracking'
	| 'siteId'
	| 'trackPageView'
	| 'trackerUrl'
> & {
	/** Matomo Cloud account host, such as `example.matomo.cloud`. */
	cloudId: string;
};

/** The `*.matomo.cloud` host in `cloudId`, unless `matomoUrl` overrides it. */
const readMatomoCloudHost = function readMatomoCloudHost(
	options: MatomoAnalyticsOptions
): string | undefined {
	if (options.matomoUrl || !options.cloudId) {
		return undefined;
	}
	const host = stripTrailingSlashes(stripProtocol(options.cloudId.trim()));
	return host.endsWith('.matomo.cloud') ? host : undefined;
};

const matomoManifestOptions = function matomoManifestOptions(
	options: Omit<MatomoAnalyticsOptions, 'cloudId'>,
	cloud: boolean
): MatomoManifestOptions {
	return {
		cloud,
		consentInitiallyGiven: options.defaultConsent === 'given',
		disableCookies: options.disableCookies ?? false,
		enableConsentMode:
			options.defaultConsent === 'required' ||
			options.defaultConsent === 'given',
		enableLinkTracking: options.enableLinkTracking ?? false,
		trackPageView: options.trackPageView ?? true,
	};
};

/**
 * Builds the serializable manifest behind {@link matomoAnalytics} for a
 * Matomo Cloud account. Loads `matomo.js` from Matomo's CDN, as Matomo's own
 * snippet does, and tracks to the account host unless `trackerUrl` (npm-only)
 * says otherwise.
 */
export const resolveMatomoAnalyticsManifest =
	function resolveMatomoAnalyticsManifest({
		cloudId,
		siteId,
		trackerUrl,
		...options
	}: MatomoCloudOptions): ResolvedManifest {
		return getCompiledManifest(
			createMatomoAnalyticsManifest(matomoManifestOptions(options, true)),
			{
				cloudId,
				siteId: String(siteId ?? 1),
				trackerUrl: trackerUrl ?? `https://${cloudId}/matomo.php`,
			}
		);
	};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; its other options stay npm-only. Marked pure so a bundler drops
 * it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'matomoAnalytics',
		{
			cloudId: {
				example: 'example.matomo.cloud',
				kind: 'id',
				label: 'Matomo Cloud host',
				pattern: '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.matomo\\.cloud$',
				required: true,
			},
			disableCookies: {
				default: false,
				kind: 'boolean',
				label: 'Disable cookies',
			},
			enableLinkTracking: {
				default: false,
				kind: 'boolean',
				label: 'Track outbound links and downloads',
			},
			siteId: {
				example: '1',
				kind: 'id',
				label: 'Site ID',
				pattern: '^[1-9][0-9]*$',
				required: false,
			},
			trackPageView: {
				default: true,
				kind: 'boolean',
				label: 'Track page views',
			},
		},
		resolveMatomoAnalyticsManifest
	);

/**
 * Creates a Matomo Analytics script.
 *
 * @remarks When the resolved `trackerUrl` or `scriptUrl` is missing, for
 *   example because neither `matomoUrl` nor `cloudId` is set and explicit
 *   `trackerUrl` and `scriptUrl` values are not supplied, the helper logs
 *   the problem with `console.error` and returns a script that never loads.
 *   Provide `matomoUrl` or `cloudId`, or both `trackerUrl` and `scriptUrl`.
 */
export const matomoAnalytics = function matomoAnalytics(
	options: MatomoAnalyticsOptions = {}
): Script {
	const cloudHost = readMatomoCloudHost(options);
	if (cloudHost !== undefined) {
		return withScriptUrl(
			resolvedManifestToScript(
				resolveMatomoAnalyticsManifest({
					...options,
					cloudId: cloudHost,
					trackerUrl: trimToUndefined(options.trackerUrl),
				})
			),
			options.scriptUrl
		);
	}

	const origin = resolveMatomoOrigin(options);
	let trackerUrl = trimToUndefined(options.trackerUrl);
	if (!trackerUrl && origin) {
		trackerUrl = joinUrlPath(origin, 'matomo.php');
	}
	let scriptUrl = trimToUndefined(options.scriptUrl);
	if (!scriptUrl && origin) {
		scriptUrl = joinUrlPath(origin, 'matomo.js');
	}

	if (!trackerUrl || !scriptUrl) {
		return skipScript(
			'matomoAnalytics: missing matomoUrl, cloudId, or explicit trackerUrl and scriptUrl',
			{ category: 'measurement', manifest: matomoAnalyticsManifest }
		);
	}

	return resolvedManifestToScript(
		getCompiledManifest(
			createMatomoAnalyticsManifest(matomoManifestOptions(options, false)),
			{ scriptUrl, siteId: String(options.siteId ?? 1), trackerUrl }
		)
	);
};
