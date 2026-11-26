/**
 * Integrations a server can resolve for a site without shipping code.
 *
 * The Inth server stores an integration key and a few options for a project,
 * checks them with {@link validateRemoteOptions}, and sends the SDK the
 * `ResolvedManifest` from `resolveRemote`. The manifest is plain JSON, and so
 * are the options: IDs that match a pattern, choices from a closed list,
 * booleans, numbers, lists of IDs, small objects of declared fields, and maps
 * from patterned keys to a closed list. No option takes a URL or a function,
 * so a manifest loads the vendor's script from the vendor's own host, or for
 * a `hostname` option, from a DNS name on the customer's domain.
 *
 * Each vendor file exports its entry as `remote`, built with `defineRemote`
 * from the same resolver its npm helper calls, so a remote entry builds the
 * same script as the helper called with the same options. The catalogue
 * walks the integrations registry to find them.
 *
 * @packageDocumentation
 */
import { manifestFeatureLevel } from '@inth/sdk/manifest-runtime';

import { getBuiltInScriptIntegration } from './registry';
import { remoteDefinitions } from './remote-catalogue';
import type { RemoteDefinition, RemoteOptionSpec } from './remote-define';
import { validateOptionValues } from './remote-validate';
import type { RemoteOptionsValidation } from './remote-validate';
import type { ResolvedManifest } from './types';

export type { ManifestStep, ResolvedManifest } from './types';
export type {
	RemoteBooleanOption,
	RemoteEnumOption,
	RemoteHostnameOption,
	RemoteIdListOption,
	RemoteIdOption,
	RemoteMapOption,
	RemoteNestedObjectOption,
	RemoteNumberOption,
	RemoteObjectOption,
	RemoteOptionSpec,
	RemoteOptionValue,
	RemoteScalarOption,
} from './remote-define';
export type { RemoteOptionsValidation } from './remote-validate';

/**
 * The manifest runtime level `manifest` needs: the highest level of any
 * step, field or runtime value it uses, and at least its own `requires`.
 * The manifest runtime's level table says which feature is which level.
 *
 * The Inth server sets `requires` to this level when it is above 1, and
 * lists the entry only for a request whose `manifestLevel` is at least this
 * level. An SDK sends `manifestLevel` with its own runtime level, and reads
 * a request without it as level 1.
 */
export const manifestLevel = function manifestLevel(
	manifest: ResolvedManifest
): number {
	return Math.max(manifestFeatureLevel(manifest), manifest.requires ?? 1);
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
	 * Builds the manifest for options that pass
	 * {@link validateRemoteOptions}. Returns a new object on every call.
	 *
	 * @throws {Error} When the options do not pass validation.
	 */
	resolveRemote: (
		options: Readonly<Record<string, unknown>>
	) => ResolvedManifest;
}

const toIntegration = function toIntegration(
	definition: RemoteDefinition
): RemoteIntegration {
	const { key, options } = definition;
	const { label, vendor } = getBuiltInScriptIntegration(key);

	return Object.freeze({
		key,
		label,
		options,
		resolveRemote(input: Readonly<Record<string, unknown>>): ResolvedManifest {
			const result = validateOptionValues(key, options, input);
			if (!result.ok) {
				throw new Error(result.issues.join('; '));
			}
			// The options passed this definition's own specs, so they have the
			// shape its resolver declares. Helpers share a cached manifest;
			// callers get their own copy.
			return structuredClone(definition.resolve(result.options as never));
		},
		vendor,
	});
};

/**
 * Integrations the Inth server may send to the SDK, by registry key: every
 * vendor in the registry whose file exports `remote`. Integrations that run
 * their own lifecycle code stay npm-only.
 */
export const remoteIntegrations: Readonly<Record<string, RemoteIntegration>> =
	Object.freeze(
		Object.fromEntries(
			remoteDefinitions.map((definition) => [
				definition.key,
				toIntegration(definition),
			])
		)
	);

/**
 * Checks options for a remote integration. Unknown keys, missing required
 * values, wrong types, values that miss their pattern, range or list, and
 * URL-shaped strings fail, each with its own issue. On success, options holds
 * every value, with enum and boolean defaults filled in.
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

	return validateOptionValues(key, integration.options, input);
};
