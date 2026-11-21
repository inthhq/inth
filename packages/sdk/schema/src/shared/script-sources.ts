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
	 * Dotted paths into the integration's own options, such as
	 * `initOptions.sdkServer`. When the options set any of them, the script
	 * does not load, from the registry or the vendor: with that option its
	 * loader downloads code from a server the registry cannot pin. A value
	 * of `undefined`, `null`, `''`, `false` or `0` is unset.
	 */
	refuseIfSet?: string[];
}

/**
 * A script registry's sources by script `id`. An entry of `null` means
 * the registry has no version it may serve, so the script does not load.
 */
export type ScriptSourcesWire = Record<string, ScriptSourceWire | null>;

/**
 * Where a script registry serves one file a vendor's loader downloads
 * while it runs, such as LogRocket's logger.
 */
export interface ScriptFileWire {
	/** The file's URL at the registry. */
	src: string;
	/** Its SRI hash, such as `sha384-…`. */
	integrity: string;
}

/**
 * A script registry's files by the exact absolute vendor URL a loader
 * requests. An entry of `null` means the registry holds or rejects that
 * file, so it does not load, and never from the vendor URL either.
 */
export type ScriptFilesWire = Record<string, ScriptFileWire | null>;

/**
 * What the Inth script registry tells Inth, on a manifest or `/v1/consent/init`.
 * Fields Inth does not know are ignored, so a later backend can add them.
 */
export interface ScriptRegistryWire {
	/** Where the registry serves each script, by script `id`. */
	sources?: ScriptSourcesWire;
	/**
	 * Files loaders download at run time, keyed by the exact absolute vendor
	 * URL the loader requests.
	 */
	files?: ScriptFilesWire;
	/**
	 * `true` when the backend answered but could not read the project's
	 * registry, such as during an incident. It comes without `sources` and
	 * `files`, and differs from no `scriptRegistry` at all, which means the
	 * project has no registry: Inth keeps the last list this browser
	 * received and loads by it, as when `/v1/consent/init` fails. Alongside
	 * a list it is ignored, and the list applies.
	 */
	unavailable?: boolean;
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
