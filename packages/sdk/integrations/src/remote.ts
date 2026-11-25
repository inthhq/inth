/**
 * Integrations a server can resolve for a site without shipping code.
 *
 * The Inth server stores an integration key and a few options for a project,
 * checks them with {@link validateRemoteOptions}, and sends the SDK the
 * `ResolvedManifest` from `resolveRemote`. The manifest is plain JSON. Options
 * are IDs that must match a pattern, or a choice from a closed list. No option
 * can set a host, a URL, an object or a function, so a manifest only loads the
 * vendor's own script.
 *
 * Each entry resolves through the same function as its npm helper, so a
 * remote entry builds the same script as the helper called with the same
 * options.
 *
 * @packageDocumentation
 */
import { getBuiltInScriptIntegration } from './registry';
import type { BuiltInScriptIntegrationKey } from './registry';
import type { ResolvedManifest } from './types';
import { resolveLinkedinInsightsManifest } from './vendors/ads-and-pixels/linkedin-insights';
import { resolveMetaPixelManifest } from './vendors/ads-and-pixels/meta-pixel';
import { resolveTiktokPixelManifest } from './vendors/ads-and-pixels/tiktok-pixel';
import { resolveGtagManifest } from './vendors/analytics/google-tag';
import { resolveClarityManifest } from './vendors/analytics/microsoft-clarity';
import { resolvePosthogManifest } from './vendors/analytics/posthog';
import { resolveGoogleTagManagerManifest } from './vendors/tag-managers/google-tag-manager';

export type { ManifestStep, ResolvedManifest } from './types';

/**
 * The manifest runtime level `manifest` needs: the highest level of any
 * step, field or runtime value it uses, and at least its own `requires`.
 * Every manifest feature today is level 1.
 *
 * The Inth server sets `requires` to this level when it is above 1, and
 * lists the entry only for a request whose `manifestLevel` is at least this
 * level. An SDK sends `manifestLevel` with its own runtime level, and reads
 * a request without it as level 1.
 */
export const manifestLevel = function manifestLevel(
	manifest: ResolvedManifest
): number {
	return Math.max(1, manifest.requires ?? 1);
};

/**
 * One option of a remote integration. A dashboard form renders from it.
 *
 * - `id`: free text that must match `pattern`, a regular expression with
 *   the `u` flag, anchored at both ends.
 * - `enum`: one of `values`. A missing value takes `default`.
 */
export type RemoteOptionSpec =
	| {
			kind: 'id';
			label: string;
			pattern: string;
			required: boolean;
			example?: string;
	  }
	| {
			kind: 'enum';
			label: string;
			values: readonly string[];
			default: string;
	  };

export interface RemoteIntegration {
	/** Registry key, such as `metaPixel`. */
	key: string;
	/** Vendor slug, such as `meta-pixel`. Also the script's `id`. */
	vendor: string;
	/** Display name, such as `Meta Pixel`. */
	label: string;
	options: Readonly<Record<string, RemoteOptionSpec>>;
	/**
	 * Builds the manifest for options that passed
	 * {@link validateRemoteOptions}. Returns a new object on every call.
	 *
	 * @throws {Error} When the options do not pass validation.
	 */
	resolveRemote: (options: Record<string, string>) => ResolvedManifest;
}

export type RemoteOptionsValidation =
	| { ok: true; options: Record<string, string> }
	| { ok: false; issues: string[] };

type RemoteOptionValues<TSpecs extends Record<string, RemoteOptionSpec>> = {
	[TName in keyof TSpecs]: TSpecs[TName] extends {
		kind: 'enum';
		values: readonly (infer TValue)[];
	}
		? TValue
		: TSpecs[TName] extends { required: true }
			? string
			: string | undefined;
};

/** A scheme such as `https:` or `javascript:`, or a `//host` reference. */
const URL_VALUE_PATTERN = /^[a-z][a-z\d+.-]*:|\/\//iu;
const MAX_VALUE_LENGTH = 200;

const loadModeOption = {
	default: 'always',
	kind: 'enum',
	label: 'Load mode',
	values: ['always', 'after-consent'],
} as const satisfies RemoteOptionSpec;

const validateOptions = function validateOptions(
	key: string,
	specs: Readonly<Record<string, RemoteOptionSpec>>,
	input: unknown
): RemoteOptionsValidation {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		return { issues: [`${key}: options must be an object`], ok: false };
	}

	const record = input as Record<string, unknown>;
	const issues: string[] = [];
	for (const name of Object.keys(record)) {
		if (!Object.hasOwn(specs, name)) {
			issues.push(`${key}: unknown option '${name}'`);
		}
	}

	const options: Record<string, string> = {};
	for (const [name, spec] of Object.entries(specs)) {
		const value = Object.hasOwn(record, name) ? record[name] : undefined;
		if (value === undefined) {
			if (spec.kind === 'enum') {
				options[name] = spec.default;
			} else if (spec.required) {
				issues.push(`${key}: '${name}' is required`);
			}
			continue;
		}

		if (typeof value !== 'string') {
			issues.push(`${key}: '${name}' must be a string`);
		} else if (URL_VALUE_PATTERN.test(value)) {
			issues.push(`${key}: '${name}' must not be a URL`);
		} else if (spec.kind === 'enum') {
			if (spec.values.includes(value)) {
				options[name] = value;
			} else {
				issues.push(
					`${key}: '${name}' must be one of ${spec.values.join(', ')}`
				);
			}
		} else if (
			value.length > MAX_VALUE_LENGTH ||
			!new RegExp(spec.pattern, 'u').test(value)
		) {
			issues.push(`${key}: '${name}' must match ${spec.pattern}`);
		} else {
			options[name] = value;
		}
	}

	return issues.length > 0 ? { issues, ok: false } : { ok: true, options };
};

const defineRemoteIntegration = function defineRemoteIntegration<
	const TSpecs extends Record<string, RemoteOptionSpec>,
>(
	key: BuiltInScriptIntegrationKey,
	options: TSpecs,
	resolve: (options: RemoteOptionValues<TSpecs>) => ResolvedManifest
): RemoteIntegration {
	const { label, vendor } = getBuiltInScriptIntegration(key);

	return Object.freeze({
		key,
		label,
		options: Object.freeze(options),
		resolveRemote(input: Record<string, string>): ResolvedManifest {
			const result = validateOptions(key, options, input);
			if (!result.ok) {
				throw new Error(result.issues.join('; '));
			}
			// Helpers share a cached manifest; callers get their own copy.
			return structuredClone(
				resolve(result.options as RemoteOptionValues<TSpecs>)
			);
		},
		vendor,
	});
};

const remoteIntegrationList = [
	defineRemoteIntegration(
		'googleTagManager',
		{
			id: {
				example: 'GTM-ABC1234',
				kind: 'id',
				label: 'Container ID',
				pattern: '^GTM-[A-Z0-9]+$',
				required: true,
			},
			loadMode: loadModeOption,
		},
		(options) => resolveGoogleTagManagerManifest(options)
	),
	defineRemoteIntegration(
		'gtag',
		{
			category: {
				default: 'measurement',
				kind: 'enum',
				label: 'Consent category',
				values: ['measurement', 'marketing'],
			},
			id: {
				example: 'G-ABC123XYZ',
				kind: 'id',
				label: 'Tag ID',
				pattern: '^(?:G|GT|AW|DC)-[A-Z0-9]+$',
				required: true,
			},
			loadMode: loadModeOption,
		},
		(options) => resolveGtagManifest(options)
	),
	defineRemoteIntegration(
		'metaPixel',
		{
			pixelId: {
				example: '123456789012345',
				kind: 'id',
				label: 'Pixel ID',
				pattern: '^[0-9]+$',
				required: true,
			},
		},
		(options) => resolveMetaPixelManifest(options)
	),
	defineRemoteIntegration(
		'posthog',
		{
			id: {
				example: 'phc_abc123XYZ',
				kind: 'id',
				label: 'Project API key',
				pattern: '^phc_[A-Za-z0-9]+$',
				required: true,
			},
			loadMode: loadModeOption,
			region: {
				default: 'eu',
				kind: 'enum',
				label: 'Region',
				values: ['eu', 'us'],
			},
		},
		(options) => resolvePosthogManifest(options)
	),
	defineRemoteIntegration(
		'microsoft-clarity',
		{
			id: {
				example: 'abcdef1234',
				kind: 'id',
				label: 'Project ID',
				pattern: '^[A-Za-z0-9]+$',
				required: true,
			},
		},
		(options) => resolveClarityManifest(options)
	),
	defineRemoteIntegration(
		'tiktokPixel',
		{
			pixelId: {
				example: 'C4ABCDEF1234567890',
				kind: 'id',
				label: 'Pixel ID',
				pattern: '^[A-Z0-9]+$',
				required: true,
			},
		},
		(options) => resolveTiktokPixelManifest(options)
	),
	defineRemoteIntegration(
		'linkedinInsights',
		{
			id: {
				example: '1234567',
				kind: 'id',
				label: 'Partner ID',
				pattern: '^[0-9]+$',
				required: true,
			},
		},
		(options) => resolveLinkedinInsightsManifest(options)
	),
];

/**
 * Integrations the Inth server may send to the SDK, by registry key.
 * Integrations that run their own lifecycle code stay npm-only.
 */
export const remoteIntegrations: Readonly<Record<string, RemoteIntegration>> =
	Object.freeze(
		Object.fromEntries(
			remoteIntegrationList.map((integration) => [integration.key, integration])
		)
	);

/**
 * Checks options for a remote integration. Unknown keys, missing IDs, values
 * that miss their pattern, URLs and values outside an option's list fail.
 * On success, options holds every value, with list defaults filled in.
 */
export const validateRemoteOptions = function validateRemoteOptions(
	key: string,
	input: unknown
): RemoteOptionsValidation {
	const integration = Object.hasOwn(remoteIntegrations, key)
		? remoteIntegrations[key]
		: undefined;
	if (integration === undefined) {
		return { issues: [`Unknown remote integration '${key}'`], ok: false };
	}

	return validateOptions(key, integration.options, input);
};
