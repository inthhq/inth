/**
 * The time a choice is dated with.
 *
 * The backend keeps, per category, the receipt with the later `confirmedAt`.
 * A device clock that moved back would date a withdrawal before the grant it
 * replaces, and the backend would keep the grant. So a choice is dated once,
 * when it is made: the later of the device clock and one millisecond after
 * its subject's floor. That one time is its receipts' `confirmedAt`, its
 * save's `givenAt`, and its place in the queue.
 *
 * The floor is the later of the latest `givenAt` the backend accepted for the
 * subject, kept with the stored consent record (`subjectDates`), and the latest
 * `givenAt` of a save still queued or in flight for it. A save the backend
 * refused leaves the queue, so it never counts.
 *
 * @packageDocumentation
 * @internal
 */
import type { SavePayload } from '../types';

/** A queued save as the outbox stores it, unvalidated. */
type StoredEntry = {
	payload?: Partial<SavePayload> & {
		confirmed?: Partial<SavePayload['confirmed']>;
	};
} | null;

/**
 * The latest `givenAt` among the queued saves of `subjectId`, or `-1`.
 *
 * @param saves - The outbox's stored saves, unvalidated.
 * @param counts - Whether a save counts; defaults to every save.
 * @internal
 */
export const queuedGivenAt = function queuedGivenAt(
	saves: unknown,
	subjectId: string,
	counts: (payload: SavePayload) => boolean = () => true
): number {
	let latest = -1;
	for (const entry of Array.isArray(saves) ? (saves as StoredEntry[]) : []) {
		const payload = entry?.payload;
		const at = payload?.givenAt ?? payload?.confirmed?.actionAt;
		if (
			payload?.subjectId === subjectId &&
			Number.isSafeInteger(at) &&
			(at as number) > latest &&
			counts(payload as SavePayload)
		) {
			latest = at as number;
		}
	}
	return latest;
};

/**
 * The time to date a choice with.
 *
 * @param time - The device clock, or the captured time of the action.
 * @param floor - The subject's floor, or `-1` without one.
 * @internal
 */
export const dateChoice = (time: number, floor: number): number =>
	Math.max(time, floor + 1);

/** The saves of one kernel whose request is out. @internal */
export interface InFlightSaves {
	/** The request of `payload` started. Keyed by its idempotency key. */
	start: (payload: SavePayload) => void;
	/** The request of `payload` finished. */
	settle: (payload: SavePayload) => void;
	/**
	 * The latest `givenAt` in flight, or `-1`. Every save of the kernel
	 * counts, whatever id it went out under: one sent under a `sub_` id
	 * still holds the floor once the visitor moved to the UUID.
	 */
	latest: () => number;
	/** Whether the request of the save with this key is out. */
	has: (idempotencyKey: string | undefined) => boolean;
}

/** @internal */
export const createInFlightSaves =
	function createInFlightSaves(): InFlightSaves {
		const saves = new Map<string, SavePayload>();
		return {
			has: (key) => key !== undefined && saves.has(key),
			latest() {
				let latest = -1;
				for (const payload of saves.values()) {
					latest = Math.max(
						latest,
						payload.givenAt ?? payload.confirmed.actionAt
					);
				}
				return latest;
			},
			settle(payload) {
				if (payload.idempotencyKey) {
					saves.delete(payload.idempotencyKey);
				}
			},
			start(payload) {
				if (payload.idempotencyKey) {
					saves.set(payload.idempotencyKey, payload);
				}
			},
		};
	};
