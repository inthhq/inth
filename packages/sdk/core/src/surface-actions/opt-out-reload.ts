/**
 * Post-reload opt-out confirmation marker and watcher.
 *
 * Kept separate from `./opt-out.ts` so surface chunks (banner, dialog,
 * trigger) do not pull `storage-keys` or reload wiring into their dependency
 * graphs. Loaded with the engine runtime.
 */

import { resolveOptOutState } from '../libs/opt-out-state.model';
import { OPT_OUT_CONFIRMATION_STORAGE_KEY } from '../libs/storage-keys';
import type { ConsentKernel } from '../consent-kernel.model';
import { openOptOutConfirmation } from './opt-out';

const readSessionStorage = (): Storage | null => {
	if (typeof window === 'undefined') {
		return null;
	}
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
};

/**
 * Record in `sessionStorage` that the next document in this tab should open
 * the opt-out confirmation view once after a revocation reload.
 *
 * Degrades silently when `sessionStorage` is blocked or unavailable.
 */
export const markPendingOptOutConfirmation =
	function markPendingOptOutConfirmation(): boolean {
		const storage = readSessionStorage();
		if (!storage) {
			return false;
		}
		try {
			storage.setItem(OPT_OUT_CONFIRMATION_STORAGE_KEY, '1');
			return true;
		} catch {
			return false;
		}
	};

/** Whether this tab has a post-reload opt-out confirmation pending. */
export const hasPendingOptOutConfirmation =
	function hasPendingOptOutConfirmation(): boolean {
		const storage = readSessionStorage();
		if (!storage) {
			return false;
		}
		try {
			return storage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY) !== null;
		} catch {
			return false;
		}
	};

/**
 * Kernels whose page came back from an opt-out reload and found no opt-out
 * held: storage kept nothing, or the site cleared it. Keyed by the kernel's
 * events object, like the confirmation registry.
 */
const reloadSpent = new WeakSet<object>();

/**
 * Whether this tab already reloaded once for an opt-out that the page could
 * not keep. True while the marker from that reload is still set, and for the
 * rest of the page once the marker was consumed with no opt-out held.
 *
 * A second reload would lose the opt-out again, and a page that opts out on
 * load would reload forever. The caller confirms in place instead.
 */
export const isOptOutReloadSpent = function isOptOutReloadSpent(
	kernel: ConsentKernel
): boolean {
	return hasPendingOptOutConfirmation() || reloadSpent.has(kernel.events);
};

/** Clear the post-reload opt-out confirmation marker for this tab. */
export const clearPendingOptOutConfirmation =
	function clearPendingOptOutConfirmation(): void {
		const storage = readSessionStorage();
		if (!storage) {
			return;
		}
		try {
			storage.removeItem(OPT_OUT_CONFIRMATION_STORAGE_KEY);
		} catch {
			// Blocked storage degrades to no confirmation after reload.
		}
	};

/** Whether `snapshot` can show the confirmation: an opt-out is held and neither the dialog nor an IAB model is active. */
const canShowConfirmation = (
	snapshot: ReturnType<ConsentKernel['getSnapshot']>
): boolean =>
	snapshot.activeUI !== 'dialog' &&
	snapshot.policyRule.model !== 'iab' &&
	resolveOptOutState(snapshot).honored;

/**
 * Drop the post-reload marker when the reload it waited for will not happen,
 * so a later load in this tab does not open a confirmation out of nowhere.
 *
 * With `open`, show the confirmation view on this document instead, because
 * no reload is coming and the visitor must still see the opt-out was honored.
 * Does nothing when no marker is set.
 */
export const releasePendingOptOutConfirmation =
	function releasePendingOptOutConfirmation(
		kernel: ConsentKernel,
		open: boolean
	): void {
		if (!hasPendingOptOutConfirmation()) {
			return;
		}
		clearPendingOptOutConfirmation();
		if (open && canShowConfirmation(kernel.getSnapshot())) {
			openOptOutConfirmation(kernel, null);
		}
	};

/**
 * Reopen the opt-out confirmation view once on a reloaded document when a
 * revocation reload set the post-reload marker in `sessionStorage`.
 *
 * Waits until `kernel`'s policy has settled. Clears the marker once checked
 * and opens the confirmation view only when an opt-out is held on this
 * document and neither the dialog nor an IAB model is active.
 *
 * @returns A disposer that stops watching.
 */
export const watchPendingOptOutConfirmation =
	function watchPendingOptOutConfirmation(kernel: ConsentKernel): () => void {
		if (!hasPendingOptOutConfirmation()) {
			return () => undefined;
		}
		let settled = false;
		let unsubscribeSnapshot: (() => void) | undefined;
		let unsubscribeInit: (() => void) | undefined;

		const stop = () => {
			settled = true;
			unsubscribeSnapshot?.();
			unsubscribeInit?.();
			unsubscribeSnapshot = undefined;
			unsubscribeInit = undefined;
		};

		const check = () => {
			if (settled) {
				return;
			}
			if (!hasPendingOptOutConfirmation()) {
				stop();
				return;
			}
			const snapshot = kernel.getSnapshot();
			if (snapshot.policyPending) {
				return;
			}
			stop();
			clearPendingOptOutConfirmation();
			if (!resolveOptOutState(snapshot).honored) {
				// The reload did not keep the opt-out. Do not reload for one again
				// on this page.
				reloadSpent.add(kernel.events);
			}
			if (canShowConfirmation(snapshot)) {
				openOptOutConfirmation(kernel, null);
			}
		};

		unsubscribeSnapshot = kernel.subscribe(check);
		unsubscribeInit = kernel.events.on('init:applied', check);
		check();
		return stop;
	};
