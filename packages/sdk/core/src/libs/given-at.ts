/**
 * The `givenAt` a consent save sends.
 *
 * The backend keeps, per category, the receipt with the later `confirmedAt`.
 * A device clock that moved back would date a withdrawal before the grant it
 * replaces, and the backend would keep the grant. So a save is dated no
 * earlier than one millisecond after its subject's floor: the latest
 * `givenAt` the backend accepted for the subject, or the latest in a save
 * still queued or in flight for it, whichever is later. A save the backend
 * refused does not count, so a clock that ran ahead and was corrected does
 * not hold later saves in the future. Where the visitor's consent record is
 * stored, the latest accepted `givenAt` is stored beside it.
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
 * The latest accepted `givenAt` stored for `subjectId`, or `-1`.
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

/**
 * The latest `givenAt` among the queued saves of `subjectId`, or `-1`.
 *
 * @param saves - The outbox's stored saves, unvalidated.
 * @internal
 */
export const queuedGivenAt = function queuedGivenAt(
	saves: unknown,
	subjectId: string
): number {
	let latest = -1;
	for (const entry of Array.isArray(saves) ? saves : []) {
		const payload = (
			entry as {
				payload?: {
					subjectId?: unknown;
					givenAt?: unknown;
					confirmed?: { actionAt?: unknown };
				};
			} | null
		)?.payload;
		const at = payload?.givenAt ?? payload?.confirmed?.actionAt;
		if (
			payload?.subjectId === subjectId &&
			Number.isSafeInteger(at) &&
			(at as number) > latest
		) {
			latest = at as number;
		}
	}
	return latest;
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
	 * Dates one save for `subjectId`. The date counts toward the floor until
	 * {@link GivenAtClock.settle} is called for it.
	 *
	 * @param time - When the visitor decided.
	 * @returns `time`, or one millisecond after the subject's floor when
	 * that is later.
	 */
	next: (subjectId: string, time: number) => number;
	/**
	 * The backend answered a save dated `at`: with `accepted`, it becomes the
	 * floor when it is later. Either way it stops counting as in flight.
	 */
	settle: (subjectId: string, at: number, accepted: boolean) => void;
	/** Keeps the accepted date in localStorage too, from now on. */
	persist: () => void;
	/** Forgets the dates, with the visitor's records. */
	clear: () => void;
	/** Gives `to`, the same subject's new id, the dates of `from`. */
	move: (from: string, to: string) => void;
}

/**
 * @param queued - The latest `givenAt` among the saves queued for a
 * subject, or `-1`.
 * @internal
 */
export const createGivenAtClock = function createGivenAtClock(
	queued: (subjectId: string) => number
): GivenAtClock {
	let accepted: LatestGivenAt | undefined;
	let inFlight: LatestGivenAt[] = [];
	let persisted = false;
	const acceptedFor = (subjectId: string) =>
		Math.max(
			accepted?.subjectId === subjectId ? accepted.at : -1,
			persisted ? readStoredGivenAt(subjectId) : -1
		);
	const keep = (next: LatestGivenAt | undefined) => {
		accepted = next;
		if (persisted) {
			store(next);
		}
	};
	return {
		clear() {
			inFlight = [];
			keep(undefined);
		},
		move(from, to) {
			const at = Math.max(acceptedFor(from), acceptedFor(to));
			if (at >= 0) {
				keep({ at, subjectId: to });
			}
			inFlight = inFlight.map((entry) =>
				entry.subjectId === from ? { ...entry, subjectId: to } : entry
			);
		},
		next(subjectId, time) {
			const floor = Math.max(
				acceptedFor(subjectId),
				queued(subjectId),
				...inFlight
					.filter((entry) => entry.subjectId === subjectId)
					.map((entry) => entry.at)
			);
			const at = Math.max(time, floor + 1);
			inFlight.push({ at, subjectId });
			return at;
		},
		persist() {
			persisted = true;
		},
		settle(subjectId, at, isAccepted) {
			const index = inFlight.findIndex(
				(entry) => entry.subjectId === subjectId && entry.at === at
			);
			if (index !== -1) {
				inFlight.splice(index, 1);
			}
			if (isAccepted && at > acceptedFor(subjectId)) {
				keep({ at, subjectId });
			}
		},
	};
};

/**
 * The floor for a save made before the kernel loaded: the stored accepted
 * date, or the latest queued one.
 *
 * @param saves - The outbox's stored saves, unvalidated.
 * @internal
 */
export const givenAtFloor = function givenAtFloor(
	subjectId: string,
	saves: unknown
): number {
	return Math.max(
		readStoredGivenAt(subjectId),
		queuedGivenAt(saves, subjectId)
	);
};
