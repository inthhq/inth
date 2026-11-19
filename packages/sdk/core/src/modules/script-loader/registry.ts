import type { ConsentSnapshot } from '../../types';
import { parseRegistrySignature } from './signature';
import { sriHashes } from './sources';
import type {
	RegistrySource,
	RegistrySources,
	ScriptRegistryState,
} from './sources';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a browser checks the script against `integrity`. It runs the
 * script unchecked when no token is a hash it can parse, so such a value
 * must not count.
 */
const hasSriHash = (integrity: string): boolean =>
	sriHashes(integrity).length > 0;

const isHttpsURL = (value: string): boolean => {
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
};

/**
 * One entry of the list, or `null` for one the loader cannot use: no
 * https `src`, no integrity hash, or attributes that are not strings or
 * `null`. Fields it does not know are ignored, so a later backend can add
 * them. A `null` signature is a missing one; a `signature` that is not
 * one reads as `null`, which no check passes.
 */
const parseEntry = (entry: unknown): RegistrySource | null => {
	if (!isRecord(entry)) {
		return null;
	}
	const { attributes, integrity, signature, src } = entry;
	if (
		!(typeof src === 'string' && isHttpsURL(src)) ||
		!(typeof integrity === 'string' && hasSriHash(integrity))
	) {
		return null;
	}
	const signed =
		signature === undefined || signature === null
			? {}
			: { signature: parseRegistrySignature(signature) };
	if (attributes === undefined || attributes === null) {
		return { integrity, src, ...signed };
	}
	if (
		!(
			isRecord(attributes) &&
			Object.values(attributes).every(
				(value) => value === null || typeof value === 'string'
			)
		)
	) {
		return null;
	}
	return {
		attributes: Object.fromEntries(Object.entries(attributes)) as Record<
			string,
			string | null
		>,
		integrity,
		src,
		...signed,
	};
};

/**
 * Check the registry's sources as init carries them:
 * `{ "<script id>": { "src", "integrity", "attributes"?, "signature"? } }`.
 *
 * @param sources - The unchecked sources.
 * @returns The sources by script `id`, with `null` for an entry the loader
 * cannot use, or `null` when `sources` is not an object.
 * @internal
 */
export const parseRegistrySources = function parseRegistrySources(
	sources: unknown
): RegistrySources | null {
	if (!isRecord(sources)) {
		return null;
	}
	// `fromEntries` defines own properties, so an id such as `__proto__`
	// stays an ordinary key.
	return Object.fromEntries(
		Object.entries(sources).map(([id, entry]) => [id, parseEntry(entry)])
	);
};

/**
 * Where the registry's list stands in a snapshot. It is `pending` while
 * init has not resolved yet, even with a list a prefetch carried. Once it
 * has, the list is the one init carried, or `failed` when init carried
 * none or failed. A failed init
 * leaves the policy pending, so its resolution tells it apart.
 *
 * @param snapshot - The kernel's snapshot, or the same fields of a
 * prefetch.
 * @returns The registry's state for the script loader.
 * @internal
 */
export const readScriptRegistry = function readScriptRegistry(snapshot: {
	readonly policyPending: boolean;
	readonly resolution?: Pick<ConsentSnapshot['resolution'], 'status'>;
	readonly scriptRegistry: ConsentSnapshot['scriptRegistry'];
}): ScriptRegistryState {
	// A list on a pending snapshot came with a prefetch for other inputs,
	// such as another language, so the live init's answer decides. A failed
	// init leaves the policy pending with a failed resolution: that list is
	// still the prefetch's, so scripts load from their own URLs.
	if (snapshot.policyPending) {
		return snapshot.resolution?.status === 'failed'
			? { status: 'failed' }
			: { status: 'pending' };
	}
	const sources = parseRegistrySources(snapshot.scriptRegistry?.sources);
	return sources ? { sources, status: 'listed' } : { status: 'failed' };
};
