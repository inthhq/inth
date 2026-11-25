import * as v from 'valibot';

import type { JsonValue } from './policy-rule-fingerprint';
import { isPlainPolicyObject } from './policy-rule-invariants';

/**
 * Where a script registry serves one script, as the manifest and `/v1/consent/init`
 * carry it.
 */
export interface ScriptSourceWire {
	/** The script's URL at the registry. */
	src: string;
	/** Its SRI hash, such as `sha384-…`. */
	integrity: string;
	/**
	 * `data-*` attributes for the script's tag: a string sets one the page
	 * does not set itself, and `null` removes it.
	 */
	attributes?: Record<string, string | null>;
	/**
	 * Inth's signature that it released these bytes. Inth rebuilds the
	 * signed statement from the URL its integration would have loaded,
	 * `integrity` and the fields here, then checks it against a key it
	 * ships with. `null`, like an absent field, means the entry has none.
	 */
	signature?: ScriptSignatureWire | null;
	/**
	 * The vendor URL this entry is a copy of. A script the Inth server sends
	 * on `load` takes the entry only when this equals the URL its manifest
	 * loads; a script declared in code takes it by `id`, as before.
	 */
	upstreamUrl?: string;
}

/**
 * The Inth script registry's `released` signature over one version.
 *
 * The signed bytes are, joined by `\n`: `inth-script-registry-v2`,
 * `released`, the vendor URL as a parsed URL's `href` (without a fragment
 * or a trailing dot on the host), `integrity`, `sha256`, `signedAt` and
 * `expiresAt`. Inth builds them itself, so a signature over another
 * statement, URL, hash or time does not verify.
 *
 * A signature is used only before `expiresAt`, and only when it is valid
 * for at most 14 days. The registry signs each version it still serves
 * again before that, so one it withdraws stops verifying within 14 days.
 */
export interface ScriptSignatureWire {
	/** The id of the signing key; Inth trusts only keys it ships with. */
	keyId: string;
	/**
	 * The ECDSA P-256 signature over SHA-256 of the statement: 64 bytes,
	 * `r` then `s` (IEEE P1363), in standard base64.
	 */
	value: string;
	/** The SHA-256 of the bytes, lowercase hex. */
	sha256: string;
	/** When the release was signed, ISO 8601 with milliseconds in UTC. */
	signedAt: string;
	/** When the signature stops being valid, ISO 8601 with milliseconds in UTC. */
	expiresAt: string;
}

/**
 * A script registry's sources by script `id`. An entry of `null` means
 * the registry has no version it may serve, so the script does not load.
 */
export type ScriptSourcesWire = Record<string, ScriptSourceWire | null>;

/**
 * What the Inth script registry tells Inth, on a manifest or `/v1/consent/init`.
 * Fields Inth does not know are ignored, so a later backend can add them.
 */
export interface ScriptRegistryWire {
	/** Where the registry serves each script, by script `id`. */
	sources?: ScriptSourcesWire;
	/**
	 * Scripts the project added on the Inth server, to load next to the
	 * scripts the site declares in code, when the site turns on
	 * `remoteScripts`. An empty list means there are none, and clears a
	 * cached one.
	 */
	load?: RemoteScriptWire[];
	/**
	 * The registry could not be read. Inth keeps the list it last had,
	 * instead of treating the registry as empty.
	 */
	unavailable?: true;
}

/**
 * A script the Inth server tells Inth to load, built from an
 * `@inth/integrations` integration.
 */
export interface RemoteScriptWire {
	/** The vendor slug, which is also the manifest's `vendor` and the script's `id`. */
	id: string;
	/** The `@inth/integrations` registry key, such as `metaPixel`, for debugging. */
	integration: string;
	/**
	 * The integration's resolved manifest: plain JSON that Inth checks
	 * before it runs any of it.
	 */
	manifest: { [key: string]: JsonValue | undefined };
}

/**
 * The registry on a manifest or `/v1/consent/init`. Only the outer object is checked:
 * Inth checks `sources` and each entry when it loads a script, so one bad
 * entry cannot reject the rest of the response. Anything but an object
 * reads as absent.
 */
export const scriptRegistrySchema = v.fallback(
	v.optional(
		v.custom<ScriptRegistryWire>(isPlainPolicyObject, 'Expected an object')
	),
	undefined
);

/**
 * Whether a `load` entry's manifest runs on a manifest runtime of `level`.
 * A manifest that needs only level 1 carries no `requires`; a newer one
 * carries the level it needs as a whole number from 1. Anything else, such
 * as `requires: 2` on a level 1 runtime or a `requires` that is not a whole
 * number, does not run.
 */
export const runsAtManifestLevel = function runsAtManifestLevel(
	manifest: unknown,
	level: number
): boolean {
	const requires =
		typeof manifest === 'object' && manifest !== null
			? (manifest as { requires?: unknown }).requires
			: undefined;
	return (
		requires === undefined ||
		(Number.isInteger(requires) &&
			(requires as number) >= 1 &&
			(requires as number) <= level)
	);
};

/**
 * `registry` without the `load` entries a manifest runtime of `level` cannot
 * run, for a list no server filtered for this runtime: one copied from a
 * static manifest, or one kept in a cache. Returns `registry` itself when
 * nothing is dropped. Malformed entries stay for the loader to report.
 */
export const registryForManifestLevel = function registryForManifestLevel<
	Registry extends ScriptRegistryWire | undefined,
>(registry: Registry, level: number): Registry {
	const load = registry?.load;
	if (!Array.isArray(load)) {
		return registry;
	}
	const kept = load.filter(
		(entry) =>
			typeof entry !== 'object' ||
			entry === null ||
			runsAtManifestLevel(entry.manifest, level)
	);
	return kept.length === load.length ? registry : { ...registry, load: kept };
};
