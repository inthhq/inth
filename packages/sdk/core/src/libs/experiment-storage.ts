/**
 * The arm a browser was shown, kept under {@link EXPERIMENT_STORAGE_KEY} so
 * a visitor keeps seeing the banner they saw. Read at start, when Inth picks
 * the arm; written by the experiment controller once the banner has shown
 * it. Holds `{ id, arm }` and nothing that identifies the visitor.
 */
import { deleteCookie, getRawCookieValue, setCookie } from './cookie';
import type { StorageConfig } from './cookie';
import { localStorageOf } from './local-storage';
import { EXPERIMENT_STORAGE_KEY } from './storage-keys';

/** What the browser keeps between visits: the arm the banner showed. */
export interface StoredExperimentArm {
	id: string;
	/** The arm the banner rendered. */
	arm: string;
}

const parseStored = function parseStored(
	raw: string | null | undefined
): StoredExperimentArm | null {
	if (!raw) {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null) {
			return null;
		}
		const record = parsed as Record<string, unknown>;
		return typeof record.id === 'string' && typeof record.arm === 'string'
			? { arm: record.arm, id: record.id }
			: null;
	} catch {
		return null;
	}
};

/**
 * Read the stored arm, from localStorage first and the cookie fallback
 * second. Never throws; unreadable storage reads as no record.
 */
export const readStoredExperimentArm =
	function readStoredExperimentArm(): StoredExperimentArm | null {
		const storage = localStorageOf();
		if (storage) {
			try {
				const stored = parseStored(storage.getItem(EXPERIMENT_STORAGE_KEY));
				if (stored) {
					return stored;
				}
			} catch {
				// Fall through to the cookie.
			}
		}
		const raw = getRawCookieValue(EXPERIMENT_STORAGE_KEY);
		if (!raw) {
			return null;
		}
		try {
			return parseStored(decodeURIComponent(raw));
		} catch {
			return null;
		}
	};

/**
 * Window property holding the arm an early `/init` request (the inline
 * prefetch script) picked, so the runtime runs the arm that request sent.
 */
export const EXPERIMENT_WINDOW_KEY = '__inthExperiment';

/**
 * The arm an early request of this page picked, if it is well formed.
 *
 * @internal
 */
export const readEarlyExperimentArm =
	function readEarlyExperimentArm(): StoredExperimentArm | null {
		if (typeof window === 'undefined') {
			return null;
		}
		const value = (window as unknown as Record<string, unknown>)[
			EXPERIMENT_WINDOW_KEY
		] as Partial<StoredExperimentArm> | null | undefined;
		return typeof value?.id === 'string' && typeof value.arm === 'string'
			? { arm: value.arm, id: value.id }
			: null;
	};

/**
 * Record the arm an early request picked, for the runtime to run.
 *
 * @internal
 */
export const writeEarlyExperimentArm = function writeEarlyExperimentArm(
	record: StoredExperimentArm
): void {
	if (typeof window !== 'undefined') {
		(window as unknown as Record<string, unknown>)[EXPERIMENT_WINDOW_KEY] = {
			arm: record.arm,
			id: record.id,
		};
	}
};

/**
 * Persist the arm the banner showed. Writes localStorage when available and
 * falls back to a cookie otherwise. A successful localStorage write also
 * drops any fallback cookie a previous visit left, so a later read that has
 * to fall back to the cookie cannot restore an older arm. Never throws.
 *
 * @param storageConfig - Cookie domain and path for the fallback.
 */
export const writeStoredExperimentArm = function writeStoredExperimentArm(
	record: StoredExperimentArm,
	storageConfig?: StorageConfig
): void {
	const serialized = JSON.stringify({ arm: record.arm, id: record.id });
	const storage = localStorageOf();
	if (storage) {
		try {
			storage.setItem(EXPERIMENT_STORAGE_KEY, serialized);
			if (getRawCookieValue(EXPERIMENT_STORAGE_KEY)) {
				deleteCookie(EXPERIMENT_STORAGE_KEY, undefined, storageConfig);
			}
			return;
		} catch {
			// Quota or blocked storage: keep the cookie as the fallback.
		}
	}
	setCookie(
		EXPERIMENT_STORAGE_KEY,
		encodeURIComponent(serialized),
		undefined,
		storageConfig
	);
};
