import type { ConsentSnapshot } from '../../types';
import { normalizeFileUrl } from './files';
import type { RegistryFile, RegistryFiles } from './files';
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
 * An entry's `refuseIfSet`: the paths, none when it is absent, or `null`
 * when it is anything but a list of non-empty strings, which makes the
 * entry one the loader cannot use.
 */
const parseRefuseIfSet = (value: unknown): string[] | null => {
	if (value === undefined || value === null) {
		return [];
	}
	return Array.isArray(value) &&
		value.every((path) => typeof path === 'string' && path !== '')
		? [...(value as string[])]
		: null;
};

/**
 * One entry of the list, or `null` for one the loader cannot use: no
 * https `src`, no integrity hash, attributes that are not strings or
 * `null`, or a `refuseIfSet` that is not a list of paths. Fields it does not know are ignored, so a later backend can add
 * them.
 */
const parseEntry = (entry: unknown): RegistrySource | null => {
	if (!isRecord(entry)) {
		return null;
	}
	const { attributes, integrity, refuseIfSet, src } = entry;
	if (
		!(typeof src === 'string' && isHttpsURL(src)) ||
		!(typeof integrity === 'string' && hasSriHash(integrity))
	) {
		return null;
	}
	const paths = parseRefuseIfSet(refuseIfSet);
	if (paths === null) {
		return null;
	}
	const refuse = paths.length > 0 ? { refuseIfSet: paths } : {};
	if (attributes === undefined || attributes === null) {
		return { integrity, src, ...refuse };
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
		...refuse,
	};
};

/**
 * Check the registry's sources as init carries them:
 * `{ "<script id>": { "src", "integrity", "attributes"? } }`.
 *
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

/** One file entry, or `null` for one with no https `src` or no hash. */
const parseFile = (entry: unknown): RegistryFile | null => {
	if (!isRecord(entry)) {
		return null;
	}
	const { integrity, src } = entry;
	return typeof src === 'string' &&
		isHttpsURL(src) &&
		typeof integrity === 'string' &&
		hasSriHash(integrity)
		? { integrity, src }
		: null;
};

/**
 * Check the registry's files as init carries them:
 * `{ "<absolute vendor URL>": { "src", "integrity" } | null }`.
 *
 * Each key is normalised as a script's URL is when it is looked up (see
 * `normalizeFileUrl`): its fragment is dropped, its query string kept. A
 * key that is not an absolute http(s) URL is skipped. When two keys name
 * the same URL and either refuses it, the file is refused.
 *
 * @param files - The unchecked files.
 * @returns The files by normalised URL, with `null` for an entry the pin
 * cannot use, or `null` when `files` is not an object.
 * @internal
 */
export const parseRegistryFiles = function parseRegistryFiles(
	files: unknown
): RegistryFiles | null {
	if (!isRecord(files)) {
		return null;
	}
	const parsed = new Map<string, RegistryFile | null>();
	for (const [url, entry] of Object.entries(files)) {
		const key = normalizeFileUrl(url);
		if (key !== null) {
			const file = parseFile(entry);
			parsed.set(
				key,
				parsed.has(key) && parsed.get(key) === null ? null : file
			);
		}
	}
	return Object.fromEntries(parsed);
};

/**
 * Where the registry's list stands in a snapshot. It is `pending` while
 * init has not resolved yet, even with a list a prefetch carried. Once it
 * has, the list is the one init carried, `sources` and `files` both, or
 * `failed` when init carried neither or failed. A failed init
 * leaves the policy pending, so its resolution tells it apart.
 *
 * @param snapshot - The kernel's snapshot, or the same fields of a
 * prefetch.
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
	const files = parseRegistryFiles(snapshot.scriptRegistry?.files);
	if (!(sources || files)) {
		return { status: 'failed' };
	}
	return { files: files ?? {}, sources: sources ?? {}, status: 'listed' };
};
