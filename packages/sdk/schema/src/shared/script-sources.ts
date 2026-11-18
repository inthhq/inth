import * as v from 'valibot';

import { isPlainPolicyObject } from './policy-rule-invariants';

/**
 * Where a script registry serves one script, as the manifest and `/init`
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
}

/**
 * A script registry's sources by script `id`. An entry of `null` means
 * the registry has no version it may serve, so the script does not load.
 */
export type ScriptSourcesWire = Record<string, ScriptSourceWire | null>;

/**
 * What the Inth script registry tells Inth, on a manifest or `/init`.
 * Fields Inth does not know are ignored, so a later backend can add them.
 */
export interface ScriptRegistryWire {
	/** Where the registry serves each script, by script `id`. */
	sources?: ScriptSourcesWire;
}

/**
 * The registry on a manifest or `/init`. Only the outer object is checked:
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
