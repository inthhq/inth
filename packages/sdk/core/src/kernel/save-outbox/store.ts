/**
 * Storage seam of the save outbox.
 *
 * The outbox keeps two lists: saves waiting for a replay and subject
 * reassignments. A store holds them and gives the outbox exclusive access
 * for one read-modify-write at a time. The outbox owns what the lists mean
 * and validates whatever a store hands back; a store only keeps the values
 * and serializes access to them.
 *
 * Adapters:
 * - {@link createBrowserOutboxStore}: localStorage under a Web Lock, shared
 *   by every tab of the origin. The default.
 * - {@link createMemoryOutboxStore}: one in-memory copy, shared by every
 *   kernel given the same store. Tests, and the browser store's fallback
 *   without localStorage.
 */

import { getRawCookieValue } from '../../libs/cookie/operations';
import {
	C15T_PENDING_SAVES_STORAGE_KEY,
	C15T_STORAGE_KEY,
	C15T_SUBJECT_REASSIGNMENTS_STORAGE_KEY,
	PENDING_SAVES_STORAGE_KEY,
	resolveStorageKeys,
	SUBJECT_REASSIGNMENTS_STORAGE_KEY,
} from '../../libs/storage-keys';
import { decodeClearEpoch } from '../../modules/persistence/record-codec';
import type { SavePayload } from '../../types';
import { toStoredPayload, withoutStoredTokens } from './stored-payload';
import type { PendingSaveEntry } from './supersession';

/**
 * The Web Lock every browser outbox transaction holds: c15t's, so c15t and
 * Inth tabs of one origin take turns on c15t's lists, which a transaction
 * adopts and a clear removes.
 */
const OUTBOX_LOCK_NAME = 'c15t-v3-pending-consent-saves:v1';

/** The lists a store keeps. */
export type OutboxSlot = 'saves' | 'reassignments';

/** Access to the stored lists inside one {@link SaveOutboxStore.transact}. */
export interface OutboxTransaction {
	/**
	 * The stored value: `undefined` when nothing is stored, `null` when the
	 * stored data cannot be read. Never trusted; the outbox validates it.
	 */
	read: (slot: OutboxSlot) => unknown;
	/**
	 * Store a list. An empty list removes the slot. A failed write is
	 * swallowed: the choice is recorded locally whether or not the outbox
	 * can keep it. Returns whether the write was stored.
	 */
	write: (slot: OutboxSlot, value: readonly unknown[]) => boolean;
}

/**
 * Where the outbox keeps its lists.
 *
 * Invariants every adapter keeps:
 * - Transactions on one store never interleave, including transactions
 *   from different kernels (and, for the browser adapter, different tabs)
 *   sharing it. Each one sees the writes of every transaction before it.
 * - `run` is synchronous and does not throw. The outbox never holds a
 *   transaction open across a network call.
 * - `transact` resolves with what `run` returned and never rejects.
 */
export interface SaveOutboxStore {
	transact: <Result>(run: (tx: OutboxTransaction) => Result) => Promise<Result>;
	/**
	 * Remove both lists now, without waiting for exclusive access, so a clear
	 * holds even when the page closes before a transaction could run. A
	 * transaction already running elsewhere can still write back what it
	 * read; the outbox calls this again inside a transaction after it.
	 */
	clear: () => void;
}

/**
 * A save as the outbox queues it, without its identity token.
 *
 * @param now - When it was queued.
 * @internal
 */
export const pendingSave = (
	payload: SavePayload,
	now: number
): PendingSaveEntry => ({
	attempts: 0,
	payload: toStoredPayload(payload),
	queuedAt: now,
});

/**
 * Queues `payload` after the saves `store` holds, for the kernel's replay
 * to send. The replay validates and orders every entry, so this one
 * appends without loading the queue's code.
 *
 * @param now - When it was queued.
 * @returns Whether the store kept it.
 * @internal
 */
export const enqueueSave = function enqueueSave(
	store: SaveOutboxStore,
	payload: SavePayload,
	now: number = Date.now()
): Promise<boolean> {
	return store.transact((tx) => {
		const stored = tx.read('saves');
		return tx.write('saves', [
			...withoutStoredTokens(stored),
			pendingSave(payload, now),
		]);
	});
};

/** The part of `Storage` a store uses. */
type TextStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

/** Browser globals the browser store reads, injectable for its own tests. */
export interface BrowserOutboxEnvironment {
	localStorage: () => TextStorage | null;
	locks: () => LockManager | null;
}

const browserEnvironment: BrowserOutboxEnvironment = {
	localStorage() {
		try {
			return typeof window === 'undefined' ? null : window.localStorage;
		} catch {
			return null;
		}
	},
	locks() {
		try {
			const locks =
				typeof navigator === 'undefined'
					? undefined
					: (navigator as Partial<Navigator>).locks;
			return locks && typeof locks.request === 'function' ? locks : null;
		} catch {
			return null;
		}
	},
};

const SLOT_KEYS: Record<OutboxSlot, string> = {
	reassignments: SUBJECT_REASSIGNMENTS_STORAGE_KEY,
	saves: PENDING_SAVES_STORAGE_KEY,
};

const C15T_SLOT_KEYS: Record<OutboxSlot, string> = {
	reassignments: C15T_SUBJECT_REASSIGNMENTS_STORAGE_KEY,
	saves: C15T_PENDING_SAVES_STORAGE_KEY,
};

/** Marks an entry adopted from c15t's lists, which c15t's clear epoch still voids. */
const ADOPTED = 'c15t';

const markAdopted = (entry: unknown): unknown =>
	entry !== null && typeof entry === 'object'
		? { ...entry, adoptedFrom: ADOPTED }
		: entry;

const isAdopted = (entry: unknown): entry is Record<string, unknown> =>
	entry !== null &&
	typeof entry === 'object' &&
	(entry as Record<string, unknown>).adoptedFrom === ADOPTED;

/** When an adopted entry was made: a save's queue time, a reassignment's. */
const adoptedAt = (
	entry: Record<string, unknown>,
	slot: OutboxSlot
): number => {
	const at = slot === 'saves' ? entry.queuedAt : entry.at;
	return typeof at === 'number' ? at : 0;
};

// c15t's default family: a c15t site on another `storageKey` clears under
// that key's epoch, which this doesn't read.
const C15T_EPOCH_KEY = resolveStorageKeys({
	storageKey: C15T_STORAGE_KEY,
}).epoch;

/** c15t's clear epoch, from its cookie or localStorage copy; `0` for none. */
const c15tClearEpoch = function c15tClearEpoch(storage: TextStorage): number {
	const now = Date.now();
	let local: string | null = null;
	try {
		local = storage.getItem(C15T_EPOCH_KEY);
	} catch {
		// Blocked storage holds no epoch.
	}
	let latest = 0;
	for (const text of [local, getRawCookieValue(C15T_EPOCH_KEY)]) {
		const decoded = text ? decodeClearEpoch(text.trim(), now) : null;
		if (decoded?.ok && decoded.record > latest) {
			latest = decoded.record;
		}
	}
	return latest;
};

/**
 * The outbox store every tab of an origin shares: JSON arrays in
 * localStorage under {@link PENDING_SAVES_STORAGE_KEY} and
 * {@link SUBJECT_REASSIGNMENTS_STORAGE_KEY}. Every transaction first
 * appends c15t's lists to these, its saves without their identity tokens,
 * and removes them, so the outbox replays what a c15t page queued; `clear`
 * removes c15t's lists too.
 *
 * Every transaction holds one Web Lock, so two tabs cannot overwrite each
 * other's entries or replay one twice. Without
 * the Web Locks API, or when the lock request fails (insecure context,
 * aborted request), a transaction runs unsynchronized rather than being
 * dropped. Without localStorage (server, blocked storage) the store falls
 * back to memory for this kernel.
 *
 * Globals are read on every transaction, never at creation.
 */
export const createBrowserOutboxStore = function createBrowserOutboxStore(
	environment: BrowserOutboxEnvironment = browserEnvironment
): SaveOutboxStore {
	const values = new Map<string, string>();
	const memory: TextStorage = {
		getItem: (key) => values.get(key) ?? null,
		removeItem: (key) => {
			values.delete(key);
		},
		setItem: (key, value) => {
			values.set(key, value);
		},
	};
	return {
		clear() {
			const storage = environment.localStorage() ?? memory;
			for (const key of [
				...Object.values(SLOT_KEYS),
				...Object.values(C15T_SLOT_KEYS),
			]) {
				try {
					storage.removeItem(key);
				} catch {
					// Blocked storage: nothing was queued there either.
				}
			}
		},
		async transact(run) {
			const storage = environment.localStorage() ?? memory;
			const readKey = (key: string): unknown => {
				try {
					const text = storage.getItem(key);
					return text === null ? undefined : JSON.parse(text);
				} catch {
					return null;
				}
			};
			const tx: OutboxTransaction = {
				read(slot) {
					const value = readKey(SLOT_KEYS[slot]);
					if (!Array.isArray(value) || !value.some(isAdopted)) {
						return value;
					}
					// A c15t tab can still clear after its entries moved here. A
					// save queued in the clear's millisecond goes too: unlike a
					// seeded record, which only shows a decision, it would send
					// one.
					const epoch = c15tClearEpoch(storage);
					const live = value.filter(
						(entry) => !(isAdopted(entry) && adoptedAt(entry, slot) <= epoch)
					);
					if (live.length !== value.length) {
						tx.write(slot, live);
					}
					return live;
				},
				write(slot, value) {
					try {
						if (value.length === 0) {
							storage.removeItem(SLOT_KEYS[slot]);
						} else {
							storage.setItem(SLOT_KEYS[slot], JSON.stringify(value));
						}
						return true;
					} catch {
						// Blocked or full storage: the choice is still recorded locally.
						return false;
					}
				},
			};
			const adoptC15tLists = () => {
				for (const slot of ['saves', 'reassignments'] as const) {
					const adopted = readKey(C15T_SLOT_KEYS[slot]);
					if (adopted === undefined) {
						continue;
					}
					if (Array.isArray(adopted)) {
						const own = readKey(SLOT_KEYS[slot]);
						if (
							!tx.write(slot, [
								...(Array.isArray(own) ? own : []),
								...(slot === 'saves'
									? withoutStoredTokens(adopted)
									: adopted
								).map(markAdopted),
							])
						) {
							continue;
						}
					}
					try {
						storage.removeItem(C15T_SLOT_KEYS[slot]);
					} catch {
						// Left for the next transaction.
					}
				}
			};
			const runAdopting = () => {
				adoptC15tLists();
				return run(tx);
			};
			const locks = storage === memory ? null : environment.locks();
			if (!locks) {
				return runAdopting();
			}
			try {
				return await locks.request(OUTBOX_LOCK_NAME, runAdopting);
			} catch {
				return runAdopting();
			}
		},
	};
};

/**
 * An outbox store held in memory: the browser store's own fallback, with no
 * localStorage. Kernels given the same store share it the way tabs share
 * the browser store, which is how tests run two tabs against one queue.
 * Transactions are synchronous, so each one runs alone; values are kept
 * serialized, so nothing the outbox reads back aliases an object it wrote.
 */
export const createMemoryOutboxStore =
	function createMemoryOutboxStore(): SaveOutboxStore {
		return createBrowserOutboxStore({
			localStorage: () => null,
			locks: () => null,
		});
	};
