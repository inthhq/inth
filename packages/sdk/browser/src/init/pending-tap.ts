/**
 * A banner Accept or Reject, or a save of categories from the dialog, the
 * init script showed at once but has not stored yet.
 *
 * The init script hides the banner and starts the scripts in the tap's own
 * task, then stores the choice with `inth.commit.js`, which it fetches at
 * the tap. If the visitor leaves before that file arrives, the choice would
 * be lost, so the tap's task also writes this small marker. Whichever
 * stores the choice removes it: the commit file, or the engine recording
 * the tap. A marker still there on the next page is recorded by the engine
 * there, once, if the banner is still due under the same policy.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk-core';

import { dropRejection } from '../drop-rejection';
import type { ConsentClient } from '../types';

/** localStorage key of the marker. */
export const PENDING_TAP_KEY = 'inth-pending-tap';

/** The marker. */
export interface PendingTap {
	/** `all` for Accept, `none` for Reject, or the categories saved. */
	c: 'all' | 'none' | Record<string, boolean>;
	/** The choice fingerprint of the policy the banner showed. */
	f: string;
	/** Epoch milliseconds of the tap. */
	t: number;
}

/**
 * Write the marker for a tap.
 *
 * @param choice - `all`, `none` or the categories saved.
 * @param snapshot - The snapshot the banner showed.
 * @param at - Epoch milliseconds of the tap.
 */
export const writePendingTap = function writePendingTap(
	choice: PendingTap['c'],
	snapshot: ConsentSnapshot,
	at: number
): void {
	try {
		localStorage.setItem(
			PENDING_TAP_KEY,
			JSON.stringify({
				c: choice,
				f: snapshot.evaluationPolicy.choice.fingerprint,
				t: at,
			} satisfies PendingTap)
		);
	} catch {
		// Blocked storage: nothing to recover from on the next page either.
	}
};

/** Remove the marker. */
export const clearPendingTap = function clearPendingTap(): void {
	try {
		localStorage.removeItem(PENDING_TAP_KEY);
	} catch {
		// Blocked storage holds no marker.
	}
};

/** The marker, or `null` when there is none or it cannot be read. */
export const readPendingTap = function readPendingTap(): PendingTap | null {
	try {
		const tap = JSON.parse(
			localStorage.getItem(PENDING_TAP_KEY) ?? 'null'
		) as PendingTap | null;
		return tap?.c &&
			(typeof tap.c === 'object' || tap.c === 'all' || tap.c === 'none')
			? tap
			: null;
	} catch {
		return null;
	}
};

/**
 * The engine's side: record a tap a previous page could not store, once
 * the client is ready, and remove the marker. The tap counts only while
 * the banner is still due under the policy it was made on, within that
 * policy's choice lifetime.
 *
 * @param client - The started client.
 * @internal
 */
export const recordPendingTap = function recordPendingTap(
	client: ConsentClient
): void {
	const tap = readPendingTap();
	if (!tap) {
		return;
	}
	dropRejection(
		// Called from a synchronous start.
		(async () => {
			const snapshot = await client.ready();
			if (readPendingTap()?.t !== tap.t) {
				return;
			}
			clearPendingTap();
			const { choice } = snapshot.evaluationPolicy;
			if (
				snapshot.activeUI === 'banner' &&
				choice.fingerprint === tap.f &&
				(choice.maxAgeMs === null || Date.now() - tap.t < choice.maxAgeMs)
			) {
				if (typeof tap.c === 'object') {
					dropRejection(client.save(tap.c));
				} else {
					dropRejection(
						tap.c === 'all' ? client.acceptAll() : client.rejectAll()
					);
				}
			}
		})()
	);
};
