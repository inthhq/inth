/**
 * Shared two-step opt-in confirmation state and surface actions.
 *
 * California regulations state: "Requests to opt-in to sale or sharing of
 * personal information and requests to opt-in to the use and disclosure of
 * sensitive personal information shall use a two-step opt-in process whereby
 * the consumer shall first, clearly request to opt-in and then second,
 * separately confirm their choice to opt-in." (11 CCR §7028(a)).
 *
 * Keeps the pending confirmation state outside the kernel so every framework
 * adapter renders one shared modal dialog, tracks its opener for focus
 * restoration, and avoids duplicate hosts without changing `KernelActiveUI`.
 */

import {
	optOutLiftBlocker,
	saveWouldLiftOptOut,
} from '../consent-record/opt-out-rules.model';
import type { AllConsentNames } from '../consent/consent-types';
import type {
	ConsentKernel,
	OptInResult,
	SaveInput,
	SaveResult,
	SaveUISource,
} from '../consent-kernel.model';
import { readFocusedElement } from './opt-out';
import { onSurfaceNavigation } from './rules';
import { saveConsentSurface } from './save-consent-surface';

/** Deferred opt-in or lifting save executed when the visitor confirms. */
export type OptInPendingAction = () => Promise<unknown> | unknown;

interface OptInConfirmationEntry {
	hosts: Set<symbol>;
	listeners: Set<() => void>;
	open: boolean;
	opener: HTMLElement | null;
	pendingAction: OptInPendingAction | null;
}

type ConfirmationKey = ConsentKernel['events'];

const keyOf = (kernel: ConsentKernel): ConfirmationKey | undefined =>
	kernel?.events;

const entries = new WeakMap<ConfirmationKey, OptInConfirmationEntry>();

const entryFor = function entryFor(
	key: ConfirmationKey
): OptInConfirmationEntry {
	let entry = entries.get(key);
	if (!entry) {
		entry = {
			hosts: new Set(),
			listeners: new Set(),
			open: false,
			opener: null,
			pendingAction: null,
		};
		entries.set(key, entry);
	}
	return entry;
};

const notify = function notify(entry: OptInConfirmationEntry): void {
	for (const listener of [...entry.listeners]) {
		listener();
	}
};

/** Cancel and close the opt-in confirmation dialog without running its action. */
export const closeOptInConfirmation = function closeOptInConfirmation(
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
	entry.open = false;
	entry.pendingAction = null;
	notify(entry);
};

/** Open the opt-in confirmation dialog with a deferred action to run on confirm. */
export const openOptInConfirmation = function openOptInConfirmation(
	kernel: ConsentKernel,
	pendingAction: OptInPendingAction,
	opener?: HTMLElement | null
): void {
	const key = keyOf(kernel);
	if (!key) {
		return;
	}
	onSurfaceNavigation(closeOptInConfirmation);
	const entry = entryFor(key);
	entry.opener = opener === undefined ? readFocusedElement() : opener;
	entry.pendingAction = pendingAction;
	entry.open = true;
	notify(entry);
};

/** Confirm the pending opt-in action, closing the dialog before running it. */
export const confirmOptInConfirmation = async function confirmOptInConfirmation(
	kernel: ConsentKernel
): Promise<unknown> {
	const key = keyOf(kernel);
	if (!key) {
		return undefined;
	}
	const entry = entries.get(key);
	if (!entry?.open) {
		return undefined;
	}
	const action = entry.pendingAction;
	entry.open = false;
	entry.pendingAction = null;
	notify(entry);
	if (!action) {
		return undefined;
	}
	return await action();
};

/** Whether the opt-in confirmation dialog is currently open for `kernel`. */
export const isOptInConfirmationOpen = function isOptInConfirmationOpen(
	kernel: ConsentKernel
): boolean {
	const key = keyOf(kernel);
	return key !== undefined && entries.get(key)?.open === true;
};

/** Read and clear the element that opened the opt-in confirmation dialog. */
export const takeOptInConfirmationOpener = function takeOptInConfirmationOpener(
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

/**
 * Claim a host slot for the opt-in confirmation dialog. Only the first active
 * host renders it so mounted surfaces never duplicate the modal.
 */
export const claimOptInConfirmationHost = function claimOptInConfirmationHost(
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
		const previous = entries.get(currentKey);
		previous?.hosts.delete(token);
		if (previous) {
			notify(previous);
		}
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

/** Whether `token` is the active host that should render the opt-in confirmation dialog. */
export const isActiveOptInConfirmationHost =
	function isActiveOptInConfirmationHost(
		kernel: ConsentKernel,
		token: symbol
	): boolean {
		const key = keyOf(kernel);
		if (!key) {
			return false;
		}
		const hosts = entries.get(key)?.hosts;
		if (!hosts || hosts.size === 0) {
			return false;
		}
		return hosts.values().next().value === token;
	};

/** Subscribe to opt-in confirmation state transitions for `kernel`. */
export const subscribeOptInConfirmation = function subscribeOptInConfirmation(
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
		const previousHost = previous?.hosts.values().next().value;
		previous?.listeners.delete(listener);
		currentKey = nextKey;
		const next = entryFor(currentKey);
		next.listeners.add(listener);
		const nextHost = next.hosts.values().next().value;
		if (wasOpen !== next.open || previousHost !== nextHost) {
			listener();
		}
	};

	const unsubscribeSnapshot = kernel.subscribe(followAttach);

	return () => {
		entries.get(currentKey)?.listeners.delete(listener);
		unsubscribeSnapshot();
	};
};

/** Context for {@link optInConsentSurface}. */
export interface OptInSurfaceContext {
	opener?: HTMLElement | null;
	uiSource?: SaveUISource;
}

/**
 * Start a two-step opt-in from the sale-and-sharing block under an opt-out
 * policy. Opens the confirmation dialog with `commands.optIn()` as its pending
 * action. Does nothing when not opted out, outside an opt-out policy, or while
 * Global Privacy Control blocks the lift.
 */
export const optInConsentSurface = function optInConsentSurface(
	kernel: ConsentKernel,
	context?: OptInSurfaceContext
): void {
	const snapshot = kernel.getSnapshot();
	if (snapshot.evaluationPolicy.model !== 'opt-out') {
		return;
	}
	const blocker = optOutLiftBlocker(snapshot);
	if (blocker === 'not-opted-out' || blocker === 'gpc-active') {
		return;
	}
	const uiSource = context?.uiSource ?? snapshot.activeUI;
	openOptInConfirmation(
		kernel,
		(): Promise<OptInResult> => kernel.commands.optIn({ uiSource }),
		context?.opener
	);
};

/** Options for {@link saveConsentSurfaceWithOptInCheck}. */
export interface SaveWithOptInCheckOptions {
	categories?: readonly AllConsentNames[];
	canClose?: () => boolean;
}

/**
 * Run a category save from a consent surface, deferring it into the two-step
 * opt-in confirmation dialog when it would lift a held opt-out under an
 * opt-out policy.
 */
export const saveConsentSurfaceWithOptInCheck = (
	kernel: ConsentKernel,
	input: SaveInput,
	save: () => Promise<SaveResult>,
	options?: SaveWithOptInCheckOptions
): Promise<SaveResult> => {
	if (saveWouldLiftOptOut(kernel.getSnapshot(), input, options?.categories)) {
		openOptInConfirmation(kernel, () =>
			saveConsentSurface(kernel, save, options?.canClose)
		);
		return Promise.resolve({ ok: false });
	}
	return saveConsentSurface(kernel, save, options?.canClose);
};
