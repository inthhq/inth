import * as v from 'valibot';

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
}

/**
 * The Inth script registry's `released` signature over one version.
 *
 * The signed bytes are, joined by `\n`: `inth-script-registry-v1`,
 * `released`, the vendor URL as a parsed URL's `href` (without a fragment
 * or a trailing dot on the host), `integrity`,
 * `sha256` and `signedAt`. Inth builds them itself, so a signature over
 * another statement, URL or hash does not verify.
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
