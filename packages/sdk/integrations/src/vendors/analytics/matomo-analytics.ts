import type { Script } from '@inth/sdk/engine';

import { resolveManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { VendorManifest } from '../../types';
import { skipScript } from '../_shared/required-id';
import {
	joinUrlPath,
	stripTrailingSlashes,
	trimToUndefined,
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

	install.push({
		async: true,
		src: '{{scriptUrl}}',
		type: 'loadScript',
	});

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

	const enableConsentMode =
		options.defaultConsent === 'required' || options.defaultConsent === 'given';
	const consentInitiallyGiven = options.defaultConsent === 'given';

	const manifest = createMatomoAnalyticsManifest({
		consentInitiallyGiven,
		disableCookies: options.disableCookies ?? false,
		enableConsentMode,
		enableLinkTracking: options.enableLinkTracking ?? false,
		trackPageView: options.trackPageView ?? true,
	});

	return resolveManifest(manifest, {
		scriptUrl,
		siteId: String(options.siteId ?? 1),
		trackerUrl,
	});
};
