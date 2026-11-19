/**
 * The `givenAt` a consent save sends.
 *
 * The backend keeps, per category, the receipt with the later `confirmedAt`,
 * and refuses a save that carries a receipt later than its `givenAt`. A
 * device clock that moved back would date a withdrawal before the grant it
 * replaces, and the backend would keep the grant. So a save is dated no
 * earlier than one millisecond after the latest `givenAt` sent for the same
 * subject, and no earlier than any receipt it carries. Where the visitor's
 * consent record is stored, the latest `givenAt` is stored beside it.
 *
 * @packageDocumentation
 * @internal
 */
import { GIVEN_AT_STORAGE_KEY } from './storage-keys';

interface LatestGivenAt {
	subjectId: string;
	at: number;
}

/**
 * The latest `givenAt` stored for `subjectId`, or `-1`.
 *
 * @internal
 */
export const readStoredGivenAt = function readStoredGivenAt(
	subjectId: string
): number {
	try {
		const stored = JSON.parse(
			globalThis.localStorage?.getItem(GIVEN_AT_STORAGE_KEY) ?? 'null'
		) as { s?: unknown; t?: unknown } | null;
		return stored?.s === subjectId && Number.isSafeInteger(stored.t)
			? (stored.t as number)
			: -1;
	} catch {
		return -1;
	}
};

const store = function store(latest: LatestGivenAt | undefined): void {
	try {
		if (latest) {
			globalThis.localStorage.setItem(
				GIVEN_AT_STORAGE_KEY,
				JSON.stringify({ s: latest.subjectId, t: latest.at })
			);
		} else {
			globalThis.localStorage.removeItem(GIVEN_AT_STORAGE_KEY);
		}
	} catch {
		// Blocked or full storage: this page still keeps the date.
	}
};

/** One kernel's dates. @internal */
export interface GivenAtClock {
	/**
	 * Dates one save for `subjectId`, and keeps the date as the latest sent.
	 *
	 * @param time - When the visitor decided, or a receipt the save carries,
	 * whichever is later.
	 * @returns `time`, or one millisecond after the latest `givenAt` sent
	 * for the subject when that is later.
	 */
	next: (subjectId: string, time: number) => number;
	/** Keeps the latest date in localStorage too, from now on. */
	persist: () => void;
	/** Forgets the latest date, with the visitor's records. */
	clear: () => void;
	/** Keeps the latest date of `from` for `to`, the same subject's new id. */
	move: (from: string, to: string) => void;
}

/** @internal */
export const createGivenAtClock = function createGivenAtClock(): GivenAtClock {
	let latest: LatestGivenAt | undefined;
	let persisted = false;
	const keep = (next: LatestGivenAt | undefined) => {
		latest = next;
		if (persisted) {
			store(next);
		}
	};
	return {
		clear: () => keep(undefined),
		move(from, to) {
			if (latest?.subjectId === from) {
				keep({ at: latest.at, subjectId: to });
			}
		},
		next(subjectId, time) {
			const previous = Math.max(
				latest?.subjectId === subjectId ? latest.at : -1,
				persisted ? readStoredGivenAt(subjectId) : -1
			);
			const at = Math.max(time, previous + 1);
			keep({ at, subjectId });
			return at;
		},
		persist() {
			persisted = true;
		},
	};
};
