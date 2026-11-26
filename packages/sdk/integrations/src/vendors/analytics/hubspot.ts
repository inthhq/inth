import type { Script } from '@inth/sdk/engine';
import { hubspotScript } from '@inth/sdk/manifest-runtime/adapters/hubspot';

import { resolvedManifestToScript } from '../../engine/runtime';
import type { IntegrationConsentCondition } from '../../registry';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { trimToUndefined, withScriptUrl } from '../_shared/script-url';

interface HubSpotCommandQueue {
	push: (command: unknown[]) => unknown;
}

interface HubSpotConversationsClient {
	clear: (options: { resetWidget: boolean }) => void;
	off: (event: 'widgetLoaded', callback: () => void) => void;
	on: (event: 'widgetLoaded', callback: () => void) => void;
	widget: {
		load: () => void;
		remove: () => void;
		status?: () => { loaded: boolean };
	};
}

declare global {
	interface Window {
		_hsp?: HubSpotCommandQueue;
		_hsq?: HubSpotCommandQueue;
		disableHubSpotCookieBanner?: boolean;
		HubSpotConversations?: HubSpotConversationsClient;
		hsConversationsOnReady?: (() => void)[];
		hsConversationsSettings?: Record<string, unknown> & {
			loadImmediately?: boolean;
		};
	}
}

const PORTAL_ID_PATTERN = /^\d+$/u;
const REGION_PATTERN = /^[a-z]{2}\d+$/u;

/**
 * HubSpot's complete loader, gated on marketing consent by default. The
 * HubSpot adapter in `@inth/sdk` inserts it as `#hs-script-loader` and
 * forwards consent.
 */
export const hubspotManifest = {
	...vendorManifestContract,
	category: 'marketing',
	install: [
		{
			async: true,
			defer: true,
			src: 'https://js.hs-scripts.com/{{portalId}}.js',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'hubspot',
	vendorDetails: {
		homepageUrl: 'https://www.hubspot.com/',
		legalName: 'HubSpot, Inc.',
		name: 'HubSpot',
		privacyPolicyUrl: 'https://legal.hubspot.com/privacy-policy',
	},
} as const satisfies VendorManifest;

/** {@link hubspotManifest} on the host of each region a dashboard offers. */
const regionalManifests = {
	eu1: {
		...hubspotManifest,
		install: [
			{
				async: true,
				defer: true,
				src: 'https://js-eu1.hs-scripts.com/{{portalId}}.js',
				type: 'loadScript',
			},
		],
	},
	na1: {
		...hubspotManifest,
		install: [
			{
				async: true,
				defer: true,
				src: 'https://js-na1.hs-scripts.com/{{portalId}}.js',
				type: 'loadScript',
			},
		],
	},
	na2: {
		...hubspotManifest,
		install: [
			{
				async: true,
				defer: true,
				src: 'https://js-na2.hs-scripts.com/{{portalId}}.js',
				type: 'loadScript',
			},
		],
	},
} as const satisfies Record<string, VendorManifest>;

type HubSpotRegion = keyof typeof regionalManifests;

const isListedRegion = (region: string | undefined): region is HubSpotRegion =>
	region !== undefined && Object.hasOwn(regionalManifests, region);

/** Configuration for the HubSpot tracking code and optional chat widget. */
export interface HubSpotOptions {
	/**
	 * Consent condition for the whole loader, including its child scripts.
	 * A weaker condition permits HubSpot requests without marketing consent.
	 * @default 'marketing'
	 */
	category?: IntegrationConsentCondition;
	/**
	 * Explicitly enable chat when functionality and the loader condition allow it.
	 * @default false
	 */
	chat?: boolean;
	/** CSP nonce for the manually inserted HubSpot loader. */
	nonce?: string;
	/** Public numeric Hub ID from the tracking code's script filename. */
	portalId: string | number;
	/**
	 * Lowercase region code from the tracking snippet, such as `na1` or `eu1`.
	 * Used only without a non-blank `scriptUrl` override. Invalid values log an
	 * error and use the region-independent host.
	 */
	region?: string;
	/**
	 * Custom or proxied loader URL. Blank values use the default regional URL.
	 * Overriding the loader does not proxy HubSpot's child requests.
	 */
	scriptUrl?: string;
}

/**
 * The manifest for HubSpot: the loader on the region's host, or on the
 * region-independent host, and the HubSpot adapter. `portalId` must
 * already be digits without leading zeros. The npm helper and the Inth
 * server both build it here.
 */
export const resolveHubSpotManifest = function resolveHubSpotManifest({
	chat = false,
	portalId,
	region = 'none',
}: {
	chat?: boolean;
	portalId: string;
	region?: HubSpotRegion | 'none';
}): ResolvedManifest {
	return {
		...getCompiledManifest(
			region === 'none' ? hubspotManifest : regionalManifests[region],
			{ portalId }
		),
		adapter: { id: 'hubspot', options: { chat, portalId } },
		requires: 4,
	};
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the
 * same resolver. `category`, `nonce`, `scriptUrl` and a region the
 * dashboard does not list stay npm-only. Marked pure so a bundler drops it
 * from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'hubspot',
		{
			chat: {
				default: false,
				kind: 'boolean',
				label: 'Chat widget, after functionality consent',
			},
			portalId: {
				example: '123456',
				kind: 'id',
				label: 'Hub ID',
				pattern: '^[0-9]{1,20}$',
				required: true,
			},
			region: {
				default: 'none',
				kind: 'enum',
				label: 'Region in the tracking code host (js-<region>.hs-scripts.com)',
				values: ['none', 'na1', 'na2', 'eu1'],
			},
		},
		({ portalId, ...options }) =>
			resolveHubSpotManifest({
				...options,
				portalId: portalId.replace(/^0+(?=\d)/u, ''),
			})
	);

/**
 * Loads HubSpot after marketing consent and forwards Inth's consent categories.
 *
 * @param options - Public portal ID, region, loader condition and chat choice.
 * @returns A consent-gated HubSpot script, or a skipped script for an invalid ID.
 * @remarks
 * No HubSpot globals or queues are created before the loader condition passes.
 * The helper disables HubSpot's banner, forwards measurement as analytics,
 * marketing as advertisement and functionality as functionality before insertion
 * and on changes. Denying the helper condition or vendor denies all three fields.
 *
 * Set `chat: true` to enable chat after functionality consent. The loader remains
 * on revocation to prevent reinjection. Consent signals, cookie revocation and
 * widget removal cannot unload HubSpot's child scripts. Keep Inth's default
 * reload on revocation enabled to stop the current page's running code.
 *
 * Remove other HubSpot installations. An existing `hs-script-loader` script is
 * reused only with a compatible URL and nonce. The helper cannot control
 * requests that installation already sent.
 * A non-script element with that ID blocks loading and logs a warning once.
 * Remove or rename the conflicting ID, then reload to retry loader insertion.
 * Wrapped setup runs in the browser after hydration, including returning grants.
 *
 * Missing, blank or non-numeric IDs log `hubspot: missing or invalid portalId`
 * and never load. Keep the returned configuration stable across rerenders.
 * @example hubspot({ chat: true, portalId: '123456', region: 'eu1' });
 * @see https://developers.hubspot.com/docs/api/events/cookie-banner
 */
export const hubspot = function hubspot(options: HubSpotOptions): Script {
	const category = (options?.category ?? 'marketing') as Script['category'];
	const rawPortalId = readId(options?.portalId);
	if (rawPortalId === undefined || !PORTAL_ID_PATTERN.test(rawPortalId)) {
		return skipMissingId('hubspot', 'portalId', {
			category,
			manifest: hubspotManifest,
		});
	}
	const portalId = rawPortalId.replace(/^0+(?=\d)/u, '');
	const chat = options.chat === true;
	const { region } = options;
	const { adapter: _adapter, ...manifest } = resolveHubSpotManifest({
		chat,
		portalId,
		region: isListedRegion(region) ? region : 'none',
	});
	let scriptUrl = trimToUndefined(options.scriptUrl);
	if (
		scriptUrl === undefined &&
		region !== undefined &&
		!isListedRegion(region)
	) {
		if (REGION_PATTERN.test(region)) {
			// A region the dashboard does not list: npm-only.
			scriptUrl = `https://js-${region}.hs-scripts.com/${portalId}.js`;
		} else {
			console.error(
				'hubspot: invalid region. Using https://js.hs-scripts.com.'
			);
		}
	}
	return hubspotScript(
		{
			...withScriptUrl(resolvedManifestToScript(manifest), scriptUrl),
			category,
		},
		{ chat, portalId },
		{ nonce: trimToUndefined(options.nonce) }
	);
};
