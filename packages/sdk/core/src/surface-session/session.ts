/**
 * The per-kernel surface session store.
 *
 * One store per kernel, kept in a `WeakMap` keyed by the kernel's events
 * like the opt-out and opt-in confirmations, so every renderer on the page
 * reads the same transient state. The store follows the kernel itself: a
 * change of `activeUI`, or explicit navigation through
 * `showConsentSurface`, clears the old surface's state without any
 * renderer having to remember to (§3.6, PERM-16).
 *
 * @packageDocumentation
 */

import type { PreferenceDraft } from '../preference-draft';
import {
	onSurfaceNavigation,
	showConsentSurface,
} from '../surface-actions/rules';
import type { ActiveUI, ConsentKernel, Unsubscribe } from '../consent-kernel.model';
import { resolveSurfaceEscape } from './resolve-surface-escape';
import type { SurfaceEscapeInput, SurfaceEscapeOutcome } from './resolve-surface-escape';
import { initialSurfaceSession, reduceSurfaceSession } from './surface-session-state.model';
import type {
	SurfaceRight,
	SurfaceSessionAction,
	SurfaceSessionState,
	SurfaceSheet,
} from './surface-session-state.model';

/** What finishing a copy attempt asks the renderer to do (CLIP-01, CLIP-03). */
export interface SurfaceCopyFinish {
	/** The result belongs to the latest attempt on the surface that is showing. */
	readonly applied: boolean;
	/**
	 * The receipt is visible, so move focus to the fallback field on a
	 * failure and announce the outcome. When Details has closed meanwhile,
	 * the failure is kept for when it reopens but nothing moves or speaks.
	 */
	readonly reveal: boolean;
}

/** What a renderer knows about where the receipt shows. */
export interface SurfaceCopyOptions {
	/**
	 * The panel holding the receipt is on screen though the banner is not
	 * expanded: an all-in-one side drawer shows it from the start.
	 */
	readonly panelVisible?: boolean;
}

/** The Escape keys a renderer reports; the session supplies the rest. */
export type SurfaceEscapeContext = Pick<
	SurfaceEscapeInput,
	'blocking' | 'focusInside' | 'leaving'
>;

/** The transient UI state of one kernel's consent surfaces. */
export interface SurfaceSession {
	readonly kernel: ConsentKernel;
	/** The current state. The same object until something changes. */
	getState: () => SurfaceSessionState;
	/** Call `listener` after every change. */
	subscribe: (listener: () => void) => Unsubscribe;
	dispatch: (action: SurfaceSessionAction) => void;
	/** Expand the banner's options in place. */
	expand: () => void;
	/** Fold the banner's options back, closing any confirmation in them. */
	collapse: () => void;
	openConfirmation: (right: SurfaceRight) => void;
	/** Record another press of "Allow" while the confirmation is open (RIGHT-04). */
	nudgeConfirmation: () => void;
	closeConfirmation: () => void;
	toggleReceipt: (open?: boolean) => void;
	/**
	 * Push a phone sheet. Ignored unless the dialog is open (PERM-01), and
	 * once two layers show (NEST-02).
	 *
	 * @returns Whether the sheet was pushed.
	 */
	pushSheet: (id: string, opener?: string | null) => boolean;
	/** Pop the top sheet. @returns It, for its opener, or `null`. */
	popSheet: () => SurfaceSheet | null;
	/** Announce `message` in `layer`, by default the top one. */
	announce: (message: string, layer?: string) => void;
	clearAnnouncement: () => void;
	/** Start a copy attempt. @returns Its attempt number. */
	beginCopy: () => number;
	/**
	 * Finish a copy attempt.
	 *
	 * @param options.panelVisible - The panel holding the receipt shows
	 * although the banner is not expanded, as in an all-in-one side drawer.
	 */
	finishCopy: (
		attempt: number,
		ok: boolean,
		options?: SurfaceCopyOptions
	) => SurfaceCopyFinish;
	/** Clear the copied or failed feedback. */
	resetCopy: () => void;
	/** End the banner after a commit: fold it, drop its transient state. */
	commit: () => void;
	/**
	 * Handle Escape (FOC-04, PERM-03, PERM-15). Applies the outcome:
	 * closing a sheet, a confirmation or the expanded panel here, and the
	 * dialog through `showConsentSurface`. A renderer calls
	 * `preventDefault()` unless the outcome is `'ignore'`.
	 */
	escape: (context: SurfaceEscapeContext) => SurfaceEscapeOutcome;
	/**
	 * Discard `draft`'s unsaved edits whenever the dialog closes (EU-02).
	 *
	 * @returns Stops discarding.
	 */
	attachDraft: (draft: PreferenceDraft) => Unsubscribe;
	/** Whether work scheduled at `token` still belongs to the surface showing. */
	isCurrent: (token: number) => boolean;
}

type SessionKey = ConsentKernel['events'];

const keyOf = (kernel: ConsentKernel): SessionKey | undefined => kernel?.events;

const sessions = new WeakMap<SessionKey, SurfaceSession>();

/** `null` reads as `'none'`, as everywhere else. */
const activeOf = (kernel: ConsentKernel): ActiveUI =>
	kernel.getSnapshot().activeUI ?? 'none';

const onNavigation = (kernel: ConsentKernel): void => {
	const key = keyOf(kernel);
	const session = key ? sessions.get(key) : undefined;
	session?.dispatch({ type: 'navigate' });
};

// oxlint-disable-next-line max-lines-per-function -- One closure keeps the store's state private.
const createSurfaceSession = function createSurfaceSession(
	kernel: ConsentKernel
): SurfaceSession {
	let state = initialSurfaceSession(activeOf(kernel));
	const listeners = new Set<() => void>();
	const drafts = new Set<PreferenceDraft>();
	let key = keyOf(kernel);

	/** Discard attached drafts' edits when the dialog closes (EU-02). */
	const resetDrafts = function resetDrafts(
		previous: SurfaceSessionState
	): void {
		if (previous.surface === 'dialog' && state.surface !== 'dialog') {
			for (const draft of drafts) {
				draft.reset();
			}
		}
	};

	const notify = function notify(): void {
		for (const listener of [...listeners]) {
			listener();
		}
	};

	const dispatch = function dispatch(action: SurfaceSessionAction): void {
		const previous = state;
		state = reduceSurfaceSession(previous, action);
		if (state !== previous) {
			resetDrafts(previous);
			notify();
		}
	};

	/**
	 * Catch up with the kernel, so a read never shows a surface it left. The
	 * store's own kernel listener normally gets there first; this covers a
	 * read from a listener the kernel called before it. Drafts reset at
	 * once: a close followed by a synchronous reopen must still discard
	 * the edits (EU-02). A read must not notify its own listeners
	 * synchronously (React calls `getSnapshot` while rendering), so they
	 * hear about it in a microtask.
	 */
	const sync = function sync(): void {
		const surface = activeOf(kernel);
		if (surface === state.surface) {
			return;
		}
		const previous = state;
		state = reduceSurfaceSession(previous, { surface, type: 'surface' });
		resetDrafts(previous);
		queueMicrotask(notify);
	};

	/** Follow the kernel from its own notification, which may notify at once. */
	const follow = function follow(): void {
		const surface = activeOf(kernel);
		if (surface !== state.surface) {
			dispatch({ surface, type: 'surface' });
		}
	};

	const session: SurfaceSession = {
		announce(message, layer) {
			dispatch({ layer, message, type: 'announce' });
		},
		attachDraft(draft) {
			drafts.add(draft);
			return () => {
				drafts.delete(draft);
			};
		},
		beginCopy() {
			follow();
			dispatch({ type: 'begin-copy' });
			return state.copy.attempt;
		},
		clearAnnouncement() {
			dispatch({ type: 'clear-announcement' });
		},
		closeConfirmation() {
			dispatch({ type: 'close-confirmation' });
		},
		collapse() {
			dispatch({ type: 'collapse' });
		},
		commit() {
			dispatch({ type: 'commit' });
		},
		dispatch,
		escape(context) {
			follow();
			const outcome = resolveSurfaceEscape({
				...context,
				confirmation: state.confirmation !== null,
				expanded: state.expanded,
				sheets: state.sheets.length,
				surface: state.surface,
			});
			switch (outcome) {
				case 'close-sheet': {
					dispatch({ type: 'pop-sheet' });
					break;
				}
				case 'close-confirmation': {
					dispatch({ type: 'close-confirmation' });
					break;
				}
				case 'collapse': {
					dispatch({ type: 'collapse' });
					break;
				}
				case 'close-dialog': {
					showConsentSurface(kernel, 'none');
					break;
				}
				default: {
					break;
				}
			}
			return outcome;
		},
		expand() {
			follow();
			dispatch({ type: 'expand' });
		},
		finishCopy(attempt, ok, options = {}) {
			follow();
			if (attempt !== state.copy.attempt) {
				return { applied: false, reveal: false };
			}
			dispatch({ attempt, ok, type: 'finish-copy' });
			// The receipt shows only while Details is open, no sheet covers
			// it and, in a banner, the panel holding it shows: expanded, or
			// always shown, as in an all-in-one drawer. Hidden, the failure
			// waits for it to reopen (CLIP-03).
			return {
				applied: true,
				reveal:
					state.receiptOpen &&
					state.sheets.length === 0 &&
					(state.surface !== 'banner' ||
						state.expanded ||
						options.panelVisible === true),
			};
		},
		getState() {
			sync();
			return state;
		},
		isCurrent(token) {
			sync();
			return state.token === token;
		},
		kernel,
		nudgeConfirmation() {
			dispatch({ type: 'nudge-confirmation' });
		},
		openConfirmation(right) {
			follow();
			dispatch({ right, type: 'open-confirmation' });
		},
		popSheet() {
			const top = state.sheets[state.sheets.length - 1] ?? null;
			dispatch({ type: 'pop-sheet' });
			return top;
		},
		pushSheet(id, opener) {
			follow();
			const before = state;
			dispatch({ id, opener, type: 'push-sheet' });
			return state !== before;
		},
		resetCopy() {
			dispatch({ type: 'reset-copy' });
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		toggleReceipt(open) {
			dispatch({ open, type: 'toggle-receipt' });
		},
	};

	kernel.subscribe(() => {
		// A deferred stand-in kernel attaches its engine by swapping its
		// events; keep this store reachable under the new key.
		const nextKey = keyOf(kernel);
		if (nextKey && nextKey !== key) {
			key = nextKey;
			if (!sessions.has(nextKey)) {
				sessions.set(nextKey, session);
			}
		}
		follow();
	});

	return session;
};

/**
 * The surface session for `kernel`, created on first use. It follows the
 * kernel from then on.
 *
 * @example
 * ```ts
 * const session = getSurfaceSession(kernel);
 * const stop = session.subscribe(() => render(session.getState()));
 * ```
 */
export const getSurfaceSession = function getSurfaceSession(
	kernel: ConsentKernel
): SurfaceSession {
	const key = keyOf(kernel);
	if (!key) {
		throw new TypeError('getSurfaceSession needs a consent kernel.');
	}
	let session = sessions.get(key);
	if (!session) {
		onSurfaceNavigation(onNavigation);
		session = createSurfaceSession(kernel);
		sessions.set(key, session);
	}
	return session;
};
