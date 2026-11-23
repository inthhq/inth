/**
 * Reload the page after a visitor revokes a permission.
 *
 * Unmounting a script cannot undo code that already ran: listeners, timers,
 * history hooks and widgets stay alive until the page unloads. When an
 * explicit accept, reject, save or one-click opt-out turns off a category or
 * vendor that was effectively granted, the page reloads once every in-flight
 * save, opt-out or lift request settles, or after one second, whichever comes
 * first, so the next document starts with only the permitted code.
 *
 * Expiry, policy changes, privacy signals and backend-synced opt-outs do not
 * reload: they change permissions without a visitor action on this page. An
 * external consent source owns its own decisions, so any withdrawal it
 * reports reloads the same way.
 */
import type {
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	Unsubscribe,
} from '../consent-kernel.model';
import type { InternalKernel } from '../kernel/kernel-internals.model';
import { vendorAxisActive } from '../libs/vendors';
import { registerOptOutReloadHook } from '../surface-actions/opt-out';
import {
	clearPendingOptOutConfirmation,
	isOptOutReloadSpent,
	markPendingOptOutConfirmation,
	releasePendingOptOutConfirmation,
} from '../surface-actions/opt-out-reload';
import { evaluateConsent } from './has';

const activeWatchers = new WeakMap<
	ConsentKernel['events'],
	Set<() => boolean>
>();

/** Options for {@link watchRevocationReload}. */
export interface RevocationReloadOptions {
	/** Kernel whose save and opt-out commands are watched. */
	kernel: ConsentKernel;
	/**
	 * Read when a reload is due. Return `false` to skip it.
	 * @default () => true
	 */
	isEnabled?: () => boolean;
	/** Called synchronously before the reload. Read when a reload is due. */
	getOnBeforeReload?: () =>
		| ((payload: { preferences: ConsentState }) => void)
		| undefined;
	/**
	 * Performs the reload.
	 * @default () => window.location.reload()
	 */
	reload?: () => void;
}

const reloadWindow = function reloadWindow(): void {
	window.location.reload();
};

/**
 * Maximum time to wait for in-flight save, opt-out and lift requests before
 * reloading after a permission revocation. Vendor stop calls have already run,
 * the choice and opt-out record are already stored locally, and delivery no
 * longer depends on the wait because requests use `keepalive` and replay from
 * the stored queue.
 */
const REVOCATION_RELOAD_WAIT_CAP_MS = 1000;

const hasRevokedCategory = function hasRevokedCategory(
	before: Readonly<ConsentState>,
	after: Readonly<ConsentState>
): boolean {
	for (const [category, granted] of Object.entries(before)) {
		if (
			category !== 'necessary' &&
			granted &&
			after[category as keyof ConsentState] === false
		) {
			return true;
		}
	}
	return false;
};

/**
 * Whether a permission that was effectively granted before an action is
 * denied after it. Covers categories and, outside IAB, vendor switches.
 * @param before - Snapshot when the command started.
 * @param after - Snapshot the command recorded.
 * @returns `true` when code allowed to run before is no longer allowed.
 */
export const hasRevokedPermission = function hasRevokedPermission(
	before: ConsentSnapshot,
	after: ConsentSnapshot
): boolean {
	if (
		hasRevokedCategory(before.effectivePermissions, after.effectivePermissions)
	) {
		return true;
	}
	if (!vendorAxisActive(after) || after.vendorChoice === before.vendorChoice) {
		return false;
	}
	const now = Date.now();
	for (const vendor of after.vendors?.declared ?? []) {
		const target = { category: vendor.category, vendor: vendor.id };
		try {
			if (
				evaluateConsent(target, before, now) &&
				!evaluateConsent(target, after, now)
			) {
				return true;
			}
		} catch {
			// An unknown category cannot have been granted before.
		}
	}
	return false;
};

/**
 * Whether {@link watchRevocationReload} is active and enabled for `kernel` in
 * a browser window.
 */
export const isRevocationReloadEnabled = function isRevocationReloadEnabled(
	kernel: ConsentKernel
): boolean {
	if (typeof window === 'undefined' || !kernel) {
		return false;
	}
	const watchers = activeWatchers.get(kernel.events);
	if (!watchers) {
		return false;
	}
	for (const enabled of watchers) {
		if (enabled()) {
			return true;
		}
	}
	return false;
};

/**
 * Whether moving `kernel` from `before` to `after` triggers a revocation
 * reload under an active {@link watchRevocationReload} watcher.
 */
export const willReloadOnRevocation = function willReloadOnRevocation(
	kernel: ConsentKernel,
	before: ConsentSnapshot,
	after: ConsentSnapshot
): boolean {
	return (
		isRevocationReloadEnabled(kernel) && hasRevokedPermission(before, after)
	);
};

/**
 * Reloads the page after an explicit action or an external consent source
 * revokes a granted permission.
 *
 * The reload waits for every in-flight save, opt-out or lift request to
 * complete, up to {@link REVOCATION_RELOAD_WAIT_CAP_MS}, and runs in a later
 * macrotask so stored records and synchronous consent callbacks finish first.
 * Framework adapters call this; applications set `reloadOnConsentRevoked`.
 * @returns A disposer that stops watching and cancels a pending reload.
 * @internal
 */
export const watchRevocationReload = function watchRevocationReload({
	kernel,
	isEnabled = () => true,
	getOnBeforeReload,
	reload = reloadWindow,
}: RevocationReloadOptions): Unsubscribe {
	const internal = kernel as Partial<InternalKernel>;
	let commandsInFlight = 0;
	let optOutRequestsInFlight = internal.getOptOutRequestsInFlight?.() ?? 0;
	let commandStartSnapshot: ConsentSnapshot | null = null;
	let revoked = false;
	let disposed = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let capTimer: ReturnType<typeof setTimeout> | null = null;
	let waitingOnHold = false;

	let watchers = activeWatchers.get(kernel.events);
	if (!watchers) {
		watchers = new Set();
		activeWatchers.set(kernel.events, watchers);
	}
	watchers.add(isEnabled);

	const clearTimers = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		if (capTimer !== null) {
			clearTimeout(capTimer);
			capTimer = null;
		}
	};

	// The opt-out click wrote a marker and skipped its confirmation because a
	// reload was due. When no watcher will reload after all, drop the marker
	// and show the confirmation on this document.
	const cancelDueReload = () => {
		if (!isRevocationReloadEnabled(kernel)) {
			releasePendingOptOutConfirmation(kernel, true);
		}
	};

	const armCapTimer = () => {
		if (
			disposed ||
			capTimer !== null ||
			timer !== null ||
			typeof window === 'undefined'
		) {
			return;
		}
		// oxlint-disable-next-line no-use-before-define -- Mutual callback with fireReload.
		capTimer = setTimeout(fireReload, REVOCATION_RELOAD_WAIT_CAP_MS);
	};

	const fireReload = () => {
		clearTimers();
		if (disposed || !revoked) {
			return;
		}
		// Never reload while persistence is still loading its write code and
		// storage holds the pre-revocation grant. Once the local write lands,
		// either the command finishes or the cap counts from there.
		const hold = internal.getSavesHold?.();
		if (hold) {
			if (!waitingOnHold) {
				waitingOnHold = true;
				void (async () => {
					await hold;
					waitingOnHold = false;
					if (!disposed && revoked) {
						armCapTimer();
						// oxlint-disable-next-line no-use-before-define -- Mutual callback with scheduleReload.
						scheduleReload();
					}
				})();
			}
			return;
		}
		revoked = false;
		if (typeof window === 'undefined' || !isEnabled()) {
			cancelDueReload();
			return;
		}
		const preferences = kernel.getSnapshot().effectivePermissions;
		getOnBeforeReload?.()?.({ preferences: { ...preferences } });
		reload();
	};

	const markRevoked = () => {
		revoked = true;
		armCapTimer();
	};

	// A save or opt-out runs synchronously from `started` to its recorded
	// events, so the latest start snapshot is always the recording command's
	// baseline.
	const onCommandStarted = () => {
		commandsInFlight += 1;
		commandStartSnapshot = kernel.getSnapshot();
	};

	const onRecorded = ({ snapshot }: { snapshot: ConsentSnapshot }) => {
		if (
			commandStartSnapshot &&
			hasRevokedPermission(commandStartSnapshot, snapshot)
		) {
			markRevoked();
		}
	};

	const scheduleReload = () => {
		if (
			commandsInFlight > 0 ||
			optOutRequestsInFlight > 0 ||
			!revoked ||
			timer !== null
		) {
			return;
		}
		if (typeof window === 'undefined' || !isEnabled()) {
			clearTimers();
			revoked = false;
			cancelDueReload();
			return;
		}
		timer = setTimeout(fireReload, 0);
	};

	const onCommandCompleted = () => {
		commandsInFlight = Math.max(0, commandsInFlight - 1);
		if (commandsInFlight === 0) {
			commandStartSnapshot = null;
		}
		scheduleReload();
	};

	const subscriptions = [
		registerOptOutReloadHook(kernel, {
			clearPending: clearPendingOptOutConfirmation,
			markPending: markPendingOptOutConfirmation,
			willReload: (before, after) => {
				if (
					typeof window === 'undefined' ||
					!isEnabled() ||
					!hasRevokedPermission(before, after)
				) {
					return false;
				}
				if (isOptOutReloadSpent(kernel)) {
					// This tab already reloaded once for an opt-out the page could
					// not keep. Confirm in place and drop the stale marker.
					clearPendingOptOutConfirmation();
					return false;
				}
				return true;
			},
		}),
		kernel.events.on('command:save:started', onCommandStarted),
		kernel.events.on('command:opt-out:started', onCommandStarted),
		kernel.events.on('choice:recorded', onRecorded),
		kernel.events.on('vendors:recorded', onRecorded),
		kernel.events.on('opt-out:recorded', ({ optOut, snapshot }) => {
			// At most one reload per tab for an opt-out the page cannot keep.
			if (optOut.method === 'button' && !isOptOutReloadSpent(kernel)) {
				onRecorded({ snapshot });
			}
		}),
		kernel.events.on('command:save:completed', onCommandCompleted),
		kernel.events.on('command:opt-out:completed', onCommandCompleted),
		...(internal.onOptOutRequestsChange
			? [
					internal.onOptOutRequestsChange((inFlight) => {
						optOutRequestsInFlight = inFlight;
						scheduleReload();
					}),
				]
			: []),
		// An external source has no save commands; its reported decision is
		// the visitor action.
		kernel.events.on('permissions:changed', ({ previous, snapshot }) => {
			if (
				snapshot.externalPermissions &&
				hasRevokedCategory(previous, snapshot.effectivePermissions)
			) {
				markRevoked();
				scheduleReload();
			}
		}),
	];

	return () => {
		disposed = true;
		watchers?.delete(isEnabled);
		if (watchers?.size === 0) {
			activeWatchers.delete(kernel.events);
		}
		for (const unsubscribe of subscriptions) {
			unsubscribe();
		}
		clearTimers();
		// A reload this watcher owed will not happen. Its surface may be gone
		// with it, so only the marker is dropped here.
		if (revoked && !isRevocationReloadEnabled(kernel)) {
			releasePendingOptOutConfirmation(kernel, false);
		}
	};
};
