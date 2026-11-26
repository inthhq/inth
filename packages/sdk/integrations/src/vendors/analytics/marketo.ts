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
		MunchkinTracker?: { init: (...args: unknown[]) => void };
		Munchkin?: {
			init: (id: string, options?: Record<string, unknown>) => void;
			munchkinFunction?: (
				command: string,
				options?: Record<string, unknown>
			) => void;
			createTrackingCookie?: (force?: boolean) => void;
		};
	}
}

/**
 * Marketo's loader, gated on consent, and Munchkin's initialisation once it
 * loads with consent. The loader completes `onLoad` only for its current,
 * connected element, so a loader removed before it ran never initialises.
 */
export const marketoManifest = {
	...vendorManifestContract,
	category: '{{category}}',
	install: [
		{
			async: true,
			src: 'https://munchkin.marketo.net/munchkin.js',
			type: 'loadScript',
		},
	],
	onLoadGranted: [
		{
			args: ['{{munchkinId}}', '{{initOptions}}'],
			global: 'Munchkin',
			method: 'init',
			type: 'callGlobal',
		},
	],
	vendor: 'marketo',
	vendorDetails: {
		homepageUrl:
			'https://business.adobe.com/products/marketo/adobe-marketo.html',
		legalName: 'Adobe Inc.',
		name: 'Marketo Munchkin',
		privacyPolicyUrl: 'https://www.adobe.com/privacy/policy.html',
	},
} as const satisfies VendorManifest;

export interface MarketoMunchkinOptions {
	/** Munchkin account ID from Marketo's installation snippet. */
	munchkinId: string;
	/** Options passed to Munchkin.init, including cookieAnon and anonymizeIP. */
	initOptions?: Record<string, unknown>;
	/** Consent condition required before loading. @default 'marketing' */
	category?: Script['category'];
	/** Custom or proxied Munchkin loader URL. */
	scriptUrl?: string;
}

/** Munchkin's own defaults for the init options a dashboard may set. */
const MUNCHKIN_DEFAULTS: Readonly<Record<string, unknown>> = {
	anonymizeIP: false,
	asyncOnly: false,
	cookieAnon: true,
};

/**
 * `initOptions` without the values Munchkin uses anyway, so a dashboard
 * form, which fills every default, sends the same options as a site that
 * left them unset. Only the remote form strips them: a site that passes a
 * default on purpose keeps it.
 */
const withoutMunchkinDefaults = (
	initOptions: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(initOptions).filter(
			([name, value]) =>
				!(
					Object.hasOwn(MUNCHKIN_DEFAULTS, name) &&
					MUNCHKIN_DEFAULTS[name] === value
				)
		)
	);

/**
 * Builds the serializable manifest behind {@link marketoMunchkin}.
 * `munchkinId` must already be trimmed and non-empty.
 */
export const resolveMarketoManifest = function resolveMarketoManifest({
	munchkinId,
	initOptions,
	category = 'marketing',
}: Omit<MarketoMunchkinOptions, 'scriptUrl'>): ResolvedManifest {
	return getCompiledManifest(marketoManifest, {
		category,
		initOptions: initOptions ?? {},
		munchkinId,
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `category`, `scriptUrl` and other init options stay npm-only.
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'marketoMunchkin',
		{
			initOptions: {
				fields: {
					anonymizeIP: {
						default: false,
						kind: 'boolean',
						label: 'Anonymize IP addresses',
					},
					asyncOnly: {
						default: false,
						kind: 'boolean',
						label: 'Send tracking requests asynchronously only',
					},
					cookieAnon: {
						default: true,
						kind: 'boolean',
						label: 'Track new anonymous visitors',
					},
				},
				kind: 'object',
				label: 'Munchkin options',
				required: false,
			},
			munchkinId: {
				example: '123-ABC-456',
				kind: 'id',
				label: 'Munchkin account ID',
				pattern: '^[0-9A-Za-z]{3}-[0-9A-Za-z]{3}-[0-9A-Za-z]{3}$',
				required: true,
			},
		},
		(options) =>
			resolveMarketoManifest({
				...options,
				initOptions: withoutMunchkinDefaults(options.initOptions),
			})
	);

/**
 * Loads and initializes Munchkin after marketing consent.
 *
 * Keep reloadOnConsentRevoked enabled. Munchkin has no documented runtime stop
 * API, and removing the tag cannot stop its listeners or clear its cookies.
 *
 * @param options - Account ID, initialization options and consent condition.
 * @returns The consent-gated script, or an inactive script for a missing ID.
 * @example marketoMunchkin({ munchkinId: 'AAA-BBB-CCC' });
 * @see https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/javascriptapi/leadtracking/lead-tracking
 */
export const marketoMunchkin = function marketoMunchkin(
	options: MarketoMunchkinOptions
): Script {
	const category = options?.category ?? 'marketing';
	const munchkinId = readId(options?.munchkinId);
	if (munchkinId === undefined) {
		return skipMissingId('marketoMunchkin', 'munchkinId', {
			category,
			manifest: marketoManifest,
		});
	}
	return withScriptUrl(
		resolvedManifestToScript(
			resolveMarketoManifest({
				category,
				initOptions: options.initOptions,
				munchkinId,
			})
		),
		options.scriptUrl
	);
};
