import type { Script } from '@inth/sdk/engine';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { withScriptUrl } from '../_shared/script-url';

export const INTERCOM_API_BASES = {
	au: 'https://api-iam.au.intercom.io',
	eu: 'https://api-iam.eu.intercom.io',
	us: 'https://api-iam.intercom.io',
} as const;

/** An Intercom data hosting region, the key of its API base. */
export type IntercomRegion = keyof typeof INTERCOM_API_BASES;

export type IntercomApiBase =
	| (typeof INTERCOM_API_BASES)[keyof typeof INTERCOM_API_BASES]
	| (string & Record<never, never>);

export type IntercomThemeMode = 'light' | 'dark' | 'system';

export interface IntercomAvatar {
	type: 'avatar';
	image_url: string;
}

export interface IntercomCompany {
	id?: string;
	company_id?: string;
	name?: string;
	created_at?: number;
	remote_created_at?: number;
	plan?: string;
	monthly_spend?: number;
	size?: number;
	website?: string;
	industry?: string;
	[key: string]: unknown;
}

export interface IntercomSettings extends Record<string, unknown> {
	app_id: string;
	api_base: IntercomApiBase;
	custom_launcher_selector?: string;
	alignment?: 'left' | 'right';
	vertical_padding?: number;
	horizontal_padding?: number;
	z_index?: number;
	hide_default_launcher?: boolean;
	hide_notifications?: boolean;
	theme_mode?: IntercomThemeMode;
	session_duration?: number;
	action_color?: string;
	background_color?: string;
	link_color?: string;
	email?: string;
	user_id?: string;
	created_at?: number;
	name?: string;
	phone?: string;
	unsubscribed_from_emails?: boolean;
	language_override?: string;
	utm_campaign?: string;
	utm_content?: string;
	utm_medium?: string;
	utm_source?: string;
	utm_term?: string;
	avatar?: IntercomAvatar;
	user_hash?: string;
	company?: IntercomCompany;
	companies?: IntercomCompany[];
	page_title?: string;
}

export type IntercomCustomSettings = Partial<
	Omit<IntercomSettings, 'app_id' | 'api_base'>
> &
	Record<string, unknown>;

declare global {
	interface Window {
		Intercom?: ((...args: unknown[]) => void) & {
			q?: unknown[][];
		};
		intercomSettings?: IntercomSettings;
	}
}

/**
 * Intercom vendor manifest.
 *
 * Seeds `window.intercomSettings` and a queueing `Intercom` stub before loading
 * the messenger widget bundle.
 */
export const intercomManifest = {
	...vendorManifestContract,
	category: 'functionality',
	install: [
		{
			ifUndefined: true,

			name: 'Intercom',
			queue: {
				property: 'q',
			},
			queueFormat: 'array',
			type: 'defineStubFunction',
		},
		{
			ifUndefined: false,

			name: 'intercomSettings',
			type: 'setGlobal',
			value: '{{settings}}',
		},
		{
			async: true,

			src: 'https://widget.intercom.io/widget/{{appId}}',
			type: 'loadScript',
		},
	],
	vendor: 'intercom',
	vendorDetails: {
		homepageUrl: 'https://www.intercom.com/',
		legalName: 'Intercom R&D Unlimited Company',
		name: 'Intercom',
		privacyPolicyUrl: 'https://www.intercom.com/legal/privacy',
	},
} as const satisfies VendorManifest;

export interface IntercomOptions {
	/**
	 * Your Intercom app ID.
	 */
	appId: string;

	/**
	 * Regional Intercom API base. Wins over `region`.
	 *
	 * @default The API base of `region`
	 */
	apiBase?: IntercomApiBase;

	/**
	 * The region that hosts your Intercom workspace, which picks the API base.
	 *
	 * @default 'us'
	 */
	region?: IntercomRegion;

	/**
	 * Additional serializable Intercom settings merged into
	 * `window.intercomSettings`.
	 */
	settings?: IntercomCustomSettings;

	/** Intercom loader URL. */
	scriptSrc?: string;
}

/**
 * Builds the serializable manifest behind {@link intercom}. The app ID must
 * already be trimmed and non-empty.
 */
export const resolveIntercomManifest = function resolveIntercomManifest({
	appId,
	region = 'us',
	apiBase = INTERCOM_API_BASES[region],
	settings,
}: Omit<IntercomOptions, 'scriptSrc'>): ResolvedManifest {
	return getCompiledManifest(intercomManifest, {
		appId,
		settings: {
			...(settings ?? {}),
			api_base: apiBase,
			app_id: appId,
		},
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; `settings`, which can carry visitor identity, a custom
 * `apiBase` and `scriptSrc` stay npm-only. Marked pure so a bundler drops it
 * from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'intercom',
		{
			appId: {
				example: 'abc12345',
				kind: 'id',
				label: 'App ID',
				pattern: '^[a-z0-9]+$',
				required: true,
			},
			region: {
				default: 'us',
				kind: 'enum',
				label: 'Region',
				values: ['us', 'eu', 'au'],
			},
		},
		resolveIntercomManifest
	);

/**
 * Creates an Intercom messenger script.
 *
 * The helper bootstraps the documented Intercom settings object and queues
 * early `Intercom(...)` calls until the messenger bundle loads.
 *
 * @remarks When `appId` is missing or blank, the
 *   helper logs `intercom: missing or invalid appId` with
 *   `console.error` and returns a script that never loads.
 *
 * @example
 * ```ts
 * const intercomScript = intercom({
 * 	appId: 'abc123',
 * });
 * ```
 *
 * @see {@link https://developers.intercom.com/installing-intercom/web/installation} Intercom installation documentation.
 */
export const intercom = function intercom({
	appId,
	scriptSrc,
	...options
}: IntercomOptions): Script {
	const normalizedAppId = readId(appId);
	if (normalizedAppId === undefined) {
		return skipMissingId('intercom', 'appId', {
			category: 'functionality',
			manifest: intercomManifest,
		});
	}

	return withScriptUrl(
		resolvedManifestToScript(
			resolveIntercomManifest({ ...options, appId: normalizedAppId })
		),
		scriptSrc
	);
};
