/**
 * The last script registry list this browser received for one backend,
 * kept so the loader can use it when `/init` fails.
 *
 * It is an availability measure for honest failures, such as an outage, a
 * rate limit or a network that drops the request: any script on the origin
 * can edit storage, so it is no defence against code already on the page.
 * The loader reads it exactly as it reads a fresh list, so an entry it
 * cannot check still loads nothing, and the browser still checks each
 * file's hash.
 */
import { isRecord } from './registry';

/**
 * How long a remembered list is used. Long enough to ride out an outage
 * over a weekend; short enough that a visitor whose `/init` keeps failing
 * falls back to the vendor's URLs, as without a list, instead of keeping a
 * list the registry may have changed. A version the registry has rejected
 * since does not load either way: the registry answers its URL with an
 * error, and the hash stops any other bytes.
 */
export const REMEMBERED_REGISTRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const KEY_PREFIX = 'c15t-script-registry:v1:';

/** One backend's remembered list. */
export interface RegistryMemory {
	/** The list as `/init` carried it, or `undefined` with none usable. */
	read: () => unknown;
	/** Remember `registry`, or forget the list when it is not an object. */
	write: (registry: unknown) => void;
}

const storage = (): Storage | undefined => {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		// A sandboxed frame or blocked storage throws on access.
		return undefined;
	}
};

/**
 * The remembered list of the backend at `projectUrl`, kept apart from every
 * other backend's on the same origin. `undefined` without a backend URL or
 * a document.
 *
 * @param projectUrl - The runtime's `projectUrl`, as the page gives it.
 * @param now - The clock, for tests.
 * @internal
 */
export const rememberedRegistry = function rememberedRegistry(
	projectUrl: string | undefined,
	now: () => number = Date.now
): RegistryMemory | undefined {
	if (!projectUrl || typeof document === 'undefined') {
		return undefined;
	}
	let backend: string;
	try {
		backend = new URL(projectUrl, document.baseURI).href;
	} catch {
		return undefined;
	}
	const key = `${KEY_PREFIX}${backend}`;
	const forget = (): void => {
		try {
			storage()?.removeItem(key);
		} catch {
			// Nothing to forget where nothing could be kept.
		}
	};
	return {
		read() {
			let stored: unknown;
			try {
				const raw = storage()?.getItem(key);
				stored = raw ? JSON.parse(raw) : undefined;
			} catch {
				stored = null;
			}
			if (stored === undefined) {
				return undefined;
			}
			const { registry, savedAt, v } = isRecord(stored) ? stored : {};
			const age = typeof savedAt === 'number' ? now() - savedAt : Number.NaN;
			if (
				v !== 1 ||
				!isRecord(registry) ||
				!(age >= 0 && age <= REMEMBERED_REGISTRY_MAX_AGE_MS)
			) {
				forget();
				return undefined;
			}
			return registry;
		},
		write(registry) {
			if (!isRecord(registry)) {
				forget();
				return;
			}
			const { files, sources } = registry;
			try {
				storage()?.setItem(
					key,
					JSON.stringify({ registry: { files, sources }, savedAt: now(), v: 1 })
				);
			} catch {
				// Full or blocked storage: the next failed init has no list.
			}
		},
	};
};
