import type { Script, ScriptSource } from '../../libs/script-loader/types';

/** Script sources by script `id`, as `scriptLoader.sources` takes them. */
export type ScriptSources = Readonly<Record<string, ScriptSource>>;

/**
 * Sources the script registry lists, by script `id`. `null` marks a script
 * the registry lists without a source it can vouch for: it does not load,
 * and never from its own URL either.
 */
export type RegistrySources = Readonly<Record<string, ScriptSource | null>>;

/**
 * Where the registry's list stands, as the loader reads it:
 * - `pending`: still on its way. Scripts it may list wait.
 * - `failed`: it could not be read. Every script loads from its own URL.
 * - `listed`: it arrived.
 */
export type ScriptRegistryState =
	| { readonly status: 'pending' }
	| { readonly status: 'failed' }
	| { readonly status: 'listed'; readonly sources: RegistrySources };

/** A script the loader does not mount yet, or at all. */
export interface HeldScript {
	script: Script;
	/**
	 * `waiting` until the registry's list arrives; `refused` when the list
	 * names the script with an entry c15t cannot check: no https `src`, no
	 * integrity hash, or attributes that are not strings or `null`;
	 * `unparsable` when a `scriptLoader.sources` entry gives an integrity
	 * with no hash a browser can parse, so the browser would check nothing.
	 */
	reason: 'refused' | 'unparsable' | 'waiting';
}

/** A script list with each script's source applied. */
export interface ResolvedScripts {
	/** Scripts to mount, each pointed at its source. */
	scripts: Script[];
	/** Scripts held back, unchanged. */
	held: HeldScript[];
}

const SRI_STRENGTH: Readonly<Record<string, number>> = {
	sha256: 1,
	sha384: 2,
	sha512: 3,
};

const sriStrength = (token: string): number =>
	SRI_STRENGTH[token.split('-')[0] ?? ''] ?? 0;

/** One SRI hash token of an algorithm browsers check, options allowed. */
const SRI_TOKEN =
	/^sha(?:256|384|512)-[A-Za-z0-9+/_-]+={0,2}(?:\?[\x21-\x7e]*)?$/u;

/**
 * The hashes a browser reads from SRI metadata, options cut. A browser
 * splits it on ASCII whitespace only and skips a token it cannot parse,
 * so a hash next to a non-breaking space is not one.
 *
 * @internal
 */
export const sriHashes = (metadata: string): string[] =>
	metadata
		.split(/[\t\n\f\r ]+/u)
		.filter((token) => SRI_TOKEN.test(token))
		.map((token) => token.split('?')[0] ?? '');

/**
 * Whether a browser checking `pinned` accepts the bytes `integrity`
 * describes. Browsers compare only the pin's hashes of its strongest
 * algorithm, so `sha512-a sha384-b` rejects bytes whose only listed hash
 * is `sha384-b`.
 */
const pinAllows = (pinned: string, integrity: string): boolean => {
	const pins = sriHashes(pinned);
	const strongest = Math.max(0, ...pins.map(sriStrength));
	const hashes = new Set(sriHashes(integrity));
	return pins.some(
		(token) => sriStrength(token) === strongest && hashes.has(token)
	);
};

/** An attribute name a source may set or remove on a tag. */
const DATA_ATTRIBUTE = /^data-[a-z0-9][a-z0-9._-]*$/u;

/**
 * `attributes`, which already holds the script's own, with a source's tag
 * attributes applied. A string is set unless the script sets that
 * attribute; a `null` removes it. Only `data-*` names apply: a source must
 * not add an event handler or change how the browser fetches the file.
 */
const withTagAttributes = (
	attributes: Record<string, string>,
	own: Readonly<Record<string, string>>,
	tagAttributes: ScriptSource['attributes']
): Record<string, string> => {
	if (!tagAttributes || typeof tagAttributes !== 'object') {
		return attributes;
	}
	const ownNames = new Set(Object.keys(own).map((name) => name.toLowerCase()));
	const removed = new Set<string>();
	const added: [string, string][] = [];
	for (const [rawName, value] of Object.entries(tagAttributes)) {
		const name = rawName.toLowerCase();
		if (!DATA_ATTRIBUTE.test(name)) {
			continue;
		}
		if (value === null) {
			removed.add(name);
		} else if (typeof value === 'string' && !ownNames.has(name)) {
			added.push([name, value]);
		}
	}
	return Object.fromEntries([
		...Object.entries(attributes).filter(
			([name]) => !removed.has(name.toLowerCase())
		),
		...added,
	]);
};

/**
 * Point a script at a source. A script's own `integrity` always stays: it
 * moves to a source that lists the same hash, or one with no hash, and
 * keeps its own URL when the source lists another.
 */
const applySource = (script: Script, source: ScriptSource): Script => {
	if (!(script.src && typeof source.src === 'string' && source.src)) {
		return script;
	}
	const own = script.attributes ?? {};
	// HTML attribute names are case-insensitive: `Integrity` is the same pin
	// as `integrity`, and a source's hash must not replace it on the element.
	const isPin = (name: string): boolean => name.toLowerCase() === 'integrity';
	// With two spellings, the element ends on the last one set.
	const pinned = Object.entries(own).findLast(([name]) => isPin(name))?.[1];
	const ownWithoutPin = Object.fromEntries(
		Object.entries(own).filter(([name]) => !isPin(name))
	);
	const attributes = withTagAttributes(ownWithoutPin, own, source.attributes);
	if (pinned?.trim()) {
		// The script pins its bytes. A source whose hash the pin does not
		// list serves other bytes, so the script keeps its own URL. Either
		// way the pin stays on the element, and the browser refuses any
		// bytes it does not allow, whoever answers at the source's URL.
		if (source.integrity && !pinAllows(pinned, source.integrity)) {
			return script;
		}
		return {
			...script,
			attributes: {
				...attributes,
				crossorigin: 'anonymous',
				integrity: pinned,
			},
			src: source.src,
		};
	}
	if (source.integrity) {
		attributes.integrity = source.integrity;
		attributes.crossorigin = 'anonymous';
	}
	return { ...script, attributes, src: source.src };
};

/**
 * Point each script with an entry in `sources` at that entry's URL, and
 * each other script an integration built at the source the script
 * registry lists for it.
 *
 * Only a script that has a `src` changes: callback-only and inline scripts
 * have no file to replace. The copy keeps every other field, callbacks
 * included. An entry in `sources` wins over the registry's.
 *
 * While the registry's list is pending, an integration's script waits in
 * `held`. Once it arrives, a script the list does not name loads from its
 * own URL, as does every script when the list could not be read. A script
 * the list names with `null` stays held: loading it from its own URL would
 * undo the registry's hold.
 *
 * @param sources - Replacement URLs and integrity hashes by script `id`.
 * @param registry - Reads the registry's list; omit it when the registry
 * is off.
 * @returns A function that resolves a script list.
 * @internal
 */
export const createScriptSourceResolver = function createScriptSourceResolver(
	sources: ScriptSources | undefined,
	registry?: () => ScriptRegistryState
): (scripts: readonly Script[]) => ResolvedScripts {
	// The same script and source resolve to the same copy, so resolving the
	// list again when the registry's list arrives does not remount a script
	// whose source did not change.
	const copies = new WeakMap<Script, { copy: Script; source: ScriptSource }>();
	const applyOnce = (script: Script, source: ScriptSource): Script => {
		const cached = copies.get(script);
		if (cached?.source === source) {
			return cached.copy;
		}
		const copy = applySource(script, source);
		copies.set(script, { copy, source });
		return copy;
	};
	return (scripts) => {
		const resolved: ResolvedScripts = { held: [], scripts: [] };
		const state = registry?.();
		for (const script of scripts) {
			const listed =
				sources && Object.hasOwn(sources, script.id)
					? sources[script.id]
					: undefined;
			if (listed) {
				if (
					script.src &&
					listed.src &&
					listed.integrity !== undefined &&
					sriHashes(listed.integrity).length === 0
				) {
					resolved.held.push({ reason: 'unparsable', script });
				} else {
					resolved.scripts.push(applyOnce(script, listed));
				}
				continue;
			}
			if (!(state && script.integration && script.src)) {
				resolved.scripts.push(script);
				continue;
			}
			if (state.status === 'pending') {
				resolved.held.push({ reason: 'waiting', script });
				continue;
			}
			const entry =
				state.status === 'listed' && Object.hasOwn(state.sources, script.id)
					? state.sources[script.id]
					: undefined;
			if (entry === null) {
				resolved.held.push({ reason: 'refused', script });
			} else {
				resolved.scripts.push(entry ? applyOnce(script, entry) : script);
			}
		}
		return resolved;
	};
};
