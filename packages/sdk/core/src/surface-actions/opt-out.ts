/**
 * Shared opt-out surface action and confirmation view state.
 *
 * Keeps the focused opt-out confirmation state outside the kernel so every
 * framework adapter can show and dismiss the confirmation view, track its
 * opener for focus restoration, and avoid duplicate hosts without changing
 * `KernelActiveUI`.
 */

import type { InternalKernel } from '../kernel/kernel-internals.model';
import type { ResolvedOptOutLink } from '../libs/consent-copy';
import {
	EMPTY_OPT_OUT_RECEIPT_DATA,
	resolveOptOutState,
} from '../libs/opt-out-state.model';
import type { OptOutReceiptData } from '../libs/opt-out-state.model';
import type {
	ConsentKernel,
	ConsentSnapshot,
	OptOutResult,
	SaveUISource,
} from '../consent-kernel.model';
import {
	actions,
	beginAction,
	onSurfaceNavigation,
	showConsentSurface,
} from './rules';

interface ConfirmationEntry {
	hosts: Set<symbol>;
	listeners: Set<() => void>;
	open: boolean;
	opener: HTMLElement | null;
}

type ConfirmationKey = ConsentKernel['events'];

const keyOf = (kernel: ConsentKernel): ConfirmationKey | undefined =>
	kernel?.events;

/**
 * Hook registered by `watchRevocationReload` when the engine watches a kernel.
 * Keeps `revocation-reload` and `storage-keys` out of surface chunks.
 * @internal
 */
export interface OptOutReloadHook {
	clearPending: () => void;
	markPending: () => boolean;
	willReload: (before: ConsentSnapshot, after: ConsentSnapshot) => boolean;
}

const reloadHooks = new WeakMap<ConfirmationKey, Set<OptOutReloadHook>>();

/**
 * Register a revocation-reload hook for `kernel` so `optOutConsentSurface`
 * defers its confirmation view across a reload without importing reload code
 * into surface chunks.
 * @internal
 */
export const registerOptOutReloadHook = function registerOptOutReloadHook(
	kernel: ConsentKernel,
	hook: OptOutReloadHook
): () => void {
	const key = keyOf(kernel);
	if (!key) {
		return () => undefined;
	}
	let hooks = reloadHooks.get(key);
	if (!hooks) {
		hooks = new Set();
		reloadHooks.set(key, hooks);
	}
	hooks.add(hook);
	return () => {
		hooks?.delete(hook);
		if (hooks?.size === 0) {
			reloadHooks.delete(key);
		}
	};
};

const activeReloadHook = function activeReloadHook(
	kernel: ConsentKernel,
	before: ConsentSnapshot,
	after: ConsentSnapshot
): OptOutReloadHook | undefined {
	const key = keyOf(kernel);
	const hooks = key ? reloadHooks.get(key) : undefined;
	if (!hooks) {
		return undefined;
	}
	for (const hook of hooks) {
		if (hook.willReload(before, after)) {
			return hook;
		}
	}
	return undefined;
};

/**
 * Carry a surface's opt-out across the revocation reload it causes: when a
 * reload is due for the move from `before` to `after`, write the
 * post-reload marker, so the next document opens the opt-out confirmation
 * once. A Privacy Choices surface shows that as its dialog with the
 * receipt. The reload itself is not delayed.
 *
 * `optOutConsentSurface` does this for its own one-click opt-out; a
 * surface that records the opt-out through `kernel.commands.optOut` calls
 * this after the command.
 *
 * @returns Whether the marker was written.
 * @internal
 */
export const markOptOutReloadIfDue = function markOptOutReloadIfDue(
	kernel: ConsentKernel,
	before: ConsentSnapshot,
	after: ConsentSnapshot
): boolean {
	return activeReloadHook(kernel, before, after)?.markPending() ?? false;
};

const entries = new WeakMap<ConfirmationKey, ConfirmationEntry>();

const entryFor = function entryFor(key: ConfirmationKey): ConfirmationEntry {
	let entry = entries.get(key);
	if (!entry) {
		entry = {
			hosts: new Set(),
			listeners: new Set(),
			open: false,
			opener: null,
		};
		entries.set(key, entry);
	}
	return entry;
};

const notify = function notify(entry: ConfirmationEntry): void {
	for (const listener of [...entry.listeners]) {
		listener();
	}
};

/**
 * Read the currently focused element, descending through open shadow roots
 * so a control inside a shadow root is captured accurately.
 */
export const readFocusedElement =
	function readFocusedElement(): HTMLElement | null {
		if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') {
			return null;
		}
		let active: Element | null = document.activeElement;
		while (active?.shadowRoot?.activeElement) {
			active = active.shadowRoot.activeElement;
		}
		return active instanceof HTMLElement &&
			active !== document.body &&
			active !== document.documentElement
			? active
			: null;
	};

/** Close the opt-out confirmation view for `kernel`. */
export const closeOptOutConfirmation = function closeOptOutConfirmation(
	kernel: ConsentKernel
): void {
	const key = keyOf(kernel);
	if (!key) {
		return;
	}
	const entry = entries.get(key);
	if (!entry?.open) {
		return;
	}
	beginAction(kernel);
	entry.open = false;
	notify(entry);
};

/** Open the opt-out confirmation view for `kernel`. */
export const openOptOutConfirmation = function openOptOutConfirmation(
	kernel: ConsentKernel,
	opener?: HTMLElement | null
): void {
	const key = keyOf(kernel);
	if (!key) {
		return;
	}
	onSurfaceNavigation(closeOptOutConfirmation);
	const entry = entryFor(key);
	entry.opener = opener === undefined ? readFocusedElement() : opener;
	entry.open = true;
	notify(entry);
};

/** Whether the opt-out confirmation view is currently open for `kernel`. */
export const isOptOutConfirmationOpen = function isOptOutConfirmationOpen(
	kernel: ConsentKernel
): boolean {
	const key = keyOf(kernel);
	return key !== undefined && entries.get(key)?.open === true;
};

/** Read and clear the element that opened the confirmation view. */
export const takeOptOutConfirmationOpener =
	function takeOptOutConfirmationOpener(
		kernel: ConsentKernel
	): HTMLElement | null {
		const key = keyOf(kernel);
		const entry = key ? entries.get(key) : undefined;
		if (!entry) {
			return null;
		}
		const { opener } = entry;
		entry.opener = null;
		return opener;
	};

/** Whether a standalone opt-out confirmation host is mounted for `kernel`. */
export const hasOptOutConfirmationHost = function hasOptOutConfirmationHost(
	kernel: ConsentKernel
): boolean {
	const key = keyOf(kernel);
	return key !== undefined && (entries.get(key)?.hosts.size ?? 0) > 0;
};

/** Subscribe to opt-out confirmation state transitions for `kernel`. */
export const subscribeOptOutConfirmation = function subscribeOptOutConfirmation(
	kernel: ConsentKernel,
	listener: () => void
): () => void {
	const initialKey = keyOf(kernel);
	if (!initialKey) {
		return () => undefined;
	}
	let currentKey = initialKey;
	entryFor(currentKey).listeners.add(listener);

	const followAttach = () => {
		const nextKey = keyOf(kernel);
		if (!nextKey || nextKey === currentKey) {
			return;
		}
		const previous = entries.get(currentKey);
		const wasOpen = previous?.open === true;
		const hadHost = (previous?.hosts.size ?? 0) > 0;
		previous?.listeners.delete(listener);
		currentKey = nextKey;
		const next = entryFor(currentKey);
		next.listeners.add(listener);
		const hasHost = next.hosts.size > 0;
		if (wasOpen !== next.open || hadHost !== hasHost) {
			listener();
		}
	};

	const unsubscribeSnapshot = kernel.subscribe(followAttach);

	return () => {
		entries.get(currentKey)?.listeners.delete(listener);
		unsubscribeSnapshot();
	};
};

/** Read the local-only opt-out receipt data held by `kernel`. */
export const getOptOutReceiptData = function getOptOutReceiptData(
	kernel: ConsentKernel
): Readonly<OptOutReceiptData> {
	return (
		(kernel as Partial<InternalKernel>).getOptOutReceiptData?.() ??
		EMPTY_OPT_OUT_RECEIPT_DATA
	);
};

/** Read the immutable revision-0 local opt-out receipt data for SSR hydration. */
export const getServerOptOutReceiptData = function getServerOptOutReceiptData(
	kernel: ConsentKernel
): Readonly<OptOutReceiptData> {
	return (
		(kernel as Partial<InternalKernel>).getServerOptOutReceiptData?.() ??
		EMPTY_OPT_OUT_RECEIPT_DATA
	);
};

/** Subscribe to local opt-out receipt data changes on `kernel` (including stand-in attach). */
export const subscribeOptOutReceiptData = function subscribeOptOutReceiptData(
	kernel: ConsentKernel,
	listener: () => void
): () => void {
	let current = (kernel as Partial<InternalKernel>).onOptOutReceiptDataChange;
	let unsubscribeData = current?.(() => {
		listener();
	});
	const unsubscribeSnapshot = kernel.subscribe(() => {
		const next = (kernel as Partial<InternalKernel>).onOptOutReceiptDataChange;
		if (next !== current) {
			unsubscribeData?.();
			current = next;
			unsubscribeData = current?.(() => {
				listener();
			});
			listener();
		}
	});
	return () => {
		unsubscribeData?.();
		unsubscribeSnapshot();
	};
};

/**
 * Claim the standalone confirmation host for `kernel` so an embedded host
 * (such as inside `ConsentDialog`) stands aside while a standalone
 * `OptOutConfirmation` is mounted.
 */
export const claimOptOutConfirmationHost = function claimOptOutConfirmationHost(
	kernel: ConsentKernel,
	token: symbol
): () => void {
	const initialKey = keyOf(kernel);
	if (!initialKey) {
		return () => undefined;
	}
	let currentKey = initialKey;
	const initialEntry = entryFor(currentKey);
	initialEntry.hosts.add(token);
	notify(initialEntry);

	const followAttach = () => {
		const nextKey = keyOf(kernel);
		if (!nextKey || nextKey === currentKey) {
			return;
		}
		entries.get(currentKey)?.hosts.delete(token);
		currentKey = nextKey;
		const nextEntry = entryFor(currentKey);
		nextEntry.hosts.add(token);
		notify(nextEntry);
	};

	const unsubscribeSnapshot = kernel.subscribe(followAttach);

	return () => {
		unsubscribeSnapshot();
		const entry = entries.get(currentKey);
		if (entry?.hosts.delete(token)) {
			notify(entry);
		}
	};
};

/**
 * Whether a floating trigger or toolbar preferences item acts as an opt-out
 * control for `snapshot`.
 */
export const isOptOutTrigger = function isOptOutTrigger(
	snapshot: Pick<
		ConsentSnapshot,
		'evaluationPolicy' | 'optOut' | 'policyRule' | 'privacySignals'
	>
): boolean {
	return (
		resolveOptOutState(snapshot).available &&
		snapshot.policyRule.rights.includes('opt-out') &&
		snapshot.policyRule.i18n?.messageProfile !== 'preferences'
	);
};

/** Context for {@link optOutConsentSurface}. */
export interface OptOutSurfaceContext {
	actionAt?: number;
	opener?: HTMLElement | null;
	uiSource?: SaveUISource;
}

/**
 * Record an opt-out in one click and open the confirmation view under an
 * opt-out policy. Under any other policy model, open the preference dialog.
 * When an external CMP owns consent, record nothing and ask that provider to
 * open its own preferences; the result is `not-available`.
 *
 * When a revocation reload is due for this opt-out, defers the confirmation
 * view to the next document through `sessionStorage` so it does not flash
 * before the reload. When no reload is due, opens the confirmation view
 * synchronously without waiting on the network.
 */
export const optOutConsentSurface = function optOutConsentSurface(
	kernel: ConsentKernel,
	context?: OptOutSurfaceContext
): Promise<OptOutResult> {
	const opener =
		context?.opener === undefined ? readFocusedElement() : context.opener;
	const before = kernel.getSnapshot();
	if (before.externalPermissions) {
		// An external CMP owns the decision, and the kernel rejects a local
		// opt-out. Ask that provider to open its own preferences instead.
		showConsentSurface(kernel, 'dialog');
		return Promise.resolve({ ok: false, reason: 'not-available' });
	}
	const pending = kernel.commands.optOut({
		actionAt: context?.actionAt,
		uiSource: context?.uiSource ?? before.activeUI,
	});
	if (!resolveOptOutState(before).available) {
		showConsentSurface(kernel, 'dialog');
		return pending;
	}
	if (before.activeUI === 'dialog') {
		showConsentSurface(kernel, 'none');
	}
	const action = beginAction(kernel);
	const after = kernel.getSnapshot();
	const honoredSynchronously = resolveOptOutState(after).honored;
	const syncReloadHook = honoredSynchronously
		? activeReloadHook(kernel, before, after)
		: undefined;
	if (syncReloadHook) {
		syncReloadHook.markPending();
	} else if (honoredSynchronously) {
		openOptOutConfirmation(kernel, opener);
	}
	// Fall back to the preference centre if a custom kernel reports
	// not-available, or handle a deferred stand-in kernel once it settles.
	// oxlint-disable-next-line promise/prefer-await-to-then -- Synchronous open must not await the network.
	void pending.then(
		(result) => {
			if (actions.get(kernel) !== action) {
				return;
			}
			if (!result.ok && result.reason === 'not-available') {
				syncReloadHook?.clearPending();
				closeOptOutConfirmation(kernel);
				showConsentSurface(kernel, 'dialog');
				return;
			}
			if (!honoredSynchronously && result.ok) {
				const settled = kernel.getSnapshot();
				if (
					settled.activeUI !== 'dialog' &&
					resolveOptOutState(settled).honored
				) {
					const settledReloadHook = activeReloadHook(kernel, before, settled);
					if (settledReloadHook) {
						settledReloadHook.markPending();
					} else if (!isOptOutConfirmationOpen(kernel)) {
						openOptOutConfirmation(kernel, opener);
					}
				}
			}
		},
		() => undefined
	);
	return pending;
};

/**
 * Activate an opt-out link, banner link, floating trigger or
 * `data-inth-action="opt-out"` element for its resolved link variant.
 *
 * A `'privacy-choices'` variant opens the preference dialog and records
 * nothing. A `'do-not-sell'` variant records an opt-out in one click through
 * {@link optOutConsentSurface}.
 */
export const activateOptOutLink = function activateOptOutLink(
	kernel: ConsentKernel,
	variant: ResolvedOptOutLink['variant'],
	context?: OptOutSurfaceContext
): Promise<OptOutResult> | undefined {
	if (variant === 'privacy-choices') {
		showConsentSurface(kernel, 'dialog');
		return undefined;
	}
	return optOutConsentSurface(kernel, context);
};
