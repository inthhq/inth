/**
 * Shared opt-out surface action and confirmation view state.
 *
 * Keeps the focused opt-out confirmation state outside the kernel so every
 * framework adapter can show and dismiss the confirmation view, track its
 * opener for focus restoration, and avoid duplicate hosts without changing
 * `KernelActiveUI`.
 */

import { resolveOptOutState } from '../libs/opt-out-state';
import type {
	ConsentKernel,
	ConsentSnapshot,
	OptOutResult,
	SaveUISource,
} from '../types';
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

const entries = new WeakMap<ConsentKernel, ConfirmationEntry>();

const entryFor = function entryFor(kernel: ConsentKernel): ConfirmationEntry {
	let entry = entries.get(kernel);
	if (!entry) {
		entry = {
			hosts: new Set(),
			listeners: new Set(),
			open: false,
			opener: null,
		};
		entries.set(kernel, entry);
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
		if (typeof document === 'undefined') {
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
	const entry = entries.get(kernel);
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
	onSurfaceNavigation(closeOptOutConfirmation);
	const entry = entryFor(kernel);
	entry.opener = opener === undefined ? readFocusedElement() : opener;
	entry.open = true;
	notify(entry);
};

/** Whether the opt-out confirmation view is currently open for `kernel`. */
export const isOptOutConfirmationOpen = function isOptOutConfirmationOpen(
	kernel: ConsentKernel
): boolean {
	return entries.get(kernel)?.open === true;
};

/** Read and clear the element that opened the confirmation view. */
export const takeOptOutConfirmationOpener =
	function takeOptOutConfirmationOpener(
		kernel: ConsentKernel
	): HTMLElement | null {
		const entry = entries.get(kernel);
		if (!entry) {
			return null;
		}
		const { opener } = entry;
		entry.opener = null;
		return opener;
	};

/** Subscribe to opt-out confirmation state transitions for `kernel`. */
export const subscribeOptOutConfirmation = function subscribeOptOutConfirmation(
	kernel: ConsentKernel,
	listener: () => void
): () => void {
	const entry = entryFor(kernel);
	entry.listeners.add(listener);
	return () => {
		entry.listeners.delete(listener);
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
	const entry = entryFor(kernel);
	entry.hosts.add(token);
	notify(entry);
	return () => {
		entry.hosts.delete(token);
		notify(entry);
	};
};

/** Whether a standalone opt-out confirmation host is mounted for `kernel`. */
export const hasOptOutConfirmationHost = function hasOptOutConfirmationHost(
	kernel: ConsentKernel
): boolean {
	return (entries.get(kernel)?.hosts.size ?? 0) > 0;
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
 *
 * `commands.optOut()` records locally before its first `await`, so the
 * confirmation view opens synchronously without waiting on the network.
 * When called on a deferred stand-in kernel whose command replays once the
 * engine attaches, the confirmation view opens once the command settles.
 */
export const optOutConsentSurface = function optOutConsentSurface(
	kernel: ConsentKernel,
	context?: OptOutSurfaceContext
): Promise<OptOutResult> {
	const opener =
		context?.opener === undefined ? readFocusedElement() : context.opener;
	const before = kernel.getSnapshot();
	const pending = kernel.commands.optOut({
		actionAt: context?.actionAt,
		uiSource: context?.uiSource ?? before.activeUI,
	});
	if (before.externalPermissions) {
		return pending;
	}
	if (!resolveOptOutState(before).available) {
		showConsentSurface(kernel, 'dialog');
		return pending;
	}
	if (before.activeUI === 'dialog') {
		showConsentSurface(kernel, 'none');
	}
	const action = beginAction(kernel);
	const openedSynchronously = resolveOptOutState(kernel.getSnapshot()).honored;
	if (openedSynchronously) {
		openOptOutConfirmation(kernel, opener);
	}
	// Fall back to the preference centre if a custom kernel reports
	// not-available, or open once a deferred stand-in kernel settles.
	// oxlint-disable-next-line promise/prefer-await-to-then -- Synchronous open must not await the network.
	void pending.then(
		(result) => {
			if (actions.get(kernel) !== action) {
				return;
			}
			if (!result.ok && result.reason === 'not-available') {
				closeOptOutConfirmation(kernel);
				showConsentSurface(kernel, 'dialog');
				return;
			}
			if (
				!openedSynchronously &&
				result.ok &&
				kernel.getSnapshot().activeUI !== 'dialog' &&
				resolveOptOutState(kernel.getSnapshot()).honored &&
				!isOptOutConfirmationOpen(kernel)
			) {
				openOptOutConfirmation(kernel, opener);
			}
		},
		() => undefined
	);
	return pending;
};
