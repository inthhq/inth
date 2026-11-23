/**
 * The surface session's state and its pure reducer.
 *
 * Holds what a consent surface shows for a moment and then forgets: the
 * expanded banner panel, the open confirmation and its nudge, receipt
 * Details, the phone sheet stack, the per-layer announcement and the copy
 * attempt. None of it is consent. It lives beside the kernel so
 * `KernelActiveUI` stays `'none' | 'banner' | 'dialog'`, and in one place so
 * every renderer clears it on the same transitions.
 *
 * @packageDocumentation
 */

import type { ActiveUI } from '../types';

/**
 * A statutory right the surface shows as a two-option control. The schema
 * has one: sale, sharing and targeted advertising, decided together.
 */
export type SurfaceRight = 'sale';

/** The main dialog card. Sheets stack above it. */
export const MAIN_LAYER = 'main';

/**
 * The most layers a dialog shows at once, the main card included. A third
 * layer left 20–25px slivers of the ones below (NEST-02).
 */
export const MAX_SURFACE_LAYERS = 2;

/** One phone sheet above the main dialog card. */
export interface SurfaceSheet {
	/** The renderer's name for the sheet, such as `'cookies'` or `'vendors:marketing'`. */
	readonly id: string;
	/** The renderer's key for the control that opened it, where focus returns. */
	readonly opener: string | null;
}

/** The open confirmation for opting back in (LAW-02). */
export interface SurfaceConfirmation {
	readonly right: SurfaceRight;
	/**
	 * How many times the visitor pressed "Allow" again while it was open
	 * (RIGHT-04). A renderer replays the shake whenever it grows; `0` means
	 * not nudged, and clears the red ring.
	 */
	readonly nudges: number;
}

/** A message for a layer's `role="status"` region. */
export interface SurfaceAnnouncement {
	/** The layer that made it, `'main'` or a sheet id (SR-02). */
	readonly layer: string;
	readonly message: string;
	/**
	 * Flips on every announcement, so the same message twice still changes
	 * the region's text and is read again (SR-03). See
	 * {@link announcementText}.
	 */
	readonly flip: boolean;
}

/** Where the last copy of the receipt reference got to. */
export type SurfaceCopyStatus = 'idle' | 'pending' | 'copied' | 'failed';

/** The copy-to-clipboard attempt (CLIP-*). */
export interface SurfaceCopy {
	/**
	 * Grows on every attempt and every surface change, so a result that
	 * arrives late, for an older attempt or a closed surface, is ignored
	 * (CLIP-02).
	 */
	readonly attempt: number;
	readonly status: SurfaceCopyStatus;
}

/** The surface session for one kernel. Replaced, never mutated. */
export interface SurfaceSessionState {
	/** The surface the kernel showed when this state was made. */
	readonly surface: ActiveUI;
	/**
	 * Grows whenever the active surface changes. A delayed reveal captures
	 * it and does nothing if it moved on, so a dialog timer never scrolls
	 * the banner that replaced it (PERM-16).
	 */
	readonly token: number;
	/** The banner's options are expanded in place. */
	readonly expanded: boolean;
	readonly confirmation: SurfaceConfirmation | null;
	/** The receipt's Details disclosure is open. */
	readonly receiptOpen: boolean;
	/** Phone sheets above the main dialog card, bottom first. Only while the dialog is open (PERM-01). */
	readonly sheets: readonly SurfaceSheet[];
	readonly announcement: SurfaceAnnouncement | null;
	readonly copy: SurfaceCopy;
}

/** Everything the session can be told. */
export type SurfaceSessionAction =
	| { type: 'surface'; surface: ActiveUI }
	| { type: 'navigate' }
	| { type: 'commit' }
	| { type: 'expand' }
	| { type: 'collapse' }
	| { type: 'open-confirmation'; right: SurfaceRight }
	| { type: 'nudge-confirmation' }
	| { type: 'close-confirmation' }
	| { type: 'toggle-receipt'; open?: boolean }
	| { type: 'push-sheet'; id: string; opener?: string | null }
	| { type: 'pop-sheet' }
	| { type: 'announce'; message: string; layer?: string }
	| { type: 'clear-announcement' }
	| { type: 'begin-copy' }
	| { type: 'finish-copy'; attempt: number; ok: boolean }
	| { type: 'reset-copy' };

const IDLE_COPY: SurfaceCopy = Object.freeze({ attempt: 0, status: 'idle' });

/** A fresh session for a kernel that shows `surface`. */
export const initialSurfaceSession = function initialSurfaceSession(
	surface: ActiveUI = 'none'
): SurfaceSessionState {
	return {
		announcement: null,
		confirmation: null,
		copy: IDLE_COPY,
		expanded: false,
		receiptOpen: false,
		sheets: [],
		surface,
		token: 0,
	};
};

/** The text a `role="status"` region shows for `announcement`. */
export const announcementText = function announcementText(
	announcement: SurfaceAnnouncement | null
): string {
	if (!announcement) {
		return '';
	}
	// A trailing zero-width space, toggled, makes a repeat a new text.
	return announcement.flip ? `${announcement.message}​` : announcement.message;
};

/** The layer on top: the last sheet, else the main card. */
export const topLayer = function topLayer(
	state: Pick<SurfaceSessionState, 'sheets'>
): string {
	return state.sheets[state.sheets.length - 1]?.id ?? MAIN_LAYER;
};

/**
 * Whether a delayed effect scheduled at `token` still belongs to the
 * surface that is showing.
 */
export const isCurrentSurface = function isCurrentSurface(
	state: Pick<SurfaceSessionState, 'token'>,
	token: number
): boolean {
	return state.token === token;
};

/** Whether the visitor is in a layer the session can stack sheets on. */
const canStack = (state: SurfaceSessionState): boolean =>
	state.surface === 'dialog';

/**
 * Drop everything that belongs to the surface being left (PERM-16, §3.6):
 * the confirmation and its nudge, receipt Details, sheets, the
 * announcement and the copy attempt. The token moves so delayed work for
 * the old surface stands down. `keepExpanded` keeps the banner's panel for
 * a banner that comes back; a commit or a banner that ends folds it.
 */
const leaveSurface = function leaveSurface(
	state: SurfaceSessionState,
	surface: ActiveUI,
	keepExpanded: boolean
): SurfaceSessionState {
	return {
		announcement: null,
		confirmation: null,
		copy: { attempt: state.copy.attempt + 1, status: 'idle' },
		expanded: keepExpanded && surface !== 'none' ? state.expanded : false,
		receiptOpen: false,
		sheets: [],
		surface,
		token: state.token + 1,
	};
};

const announce = function announce(
	state: SurfaceSessionState,
	message: string,
	layer: string | undefined
): SurfaceSessionState {
	const target = layer ?? topLayer(state);
	// Only a layer that is showing may speak (SR-02).
	if (target !== MAIN_LAYER && !state.sheets.some(({ id }) => id === target)) {
		return state;
	}
	return {
		...state,
		announcement: {
			flip: !(state.announcement?.flip ?? false),
			layer: target,
			message,
		},
	};
};

/**
 * Apply one action. Returns `state` itself when nothing changed, so a
 * store can skip notifying.
 */
// oxlint-disable-next-line complexity -- One switch over every action keeps the transitions readable together.
export const reduceSurfaceSession = function reduceSurfaceSession(
	state: SurfaceSessionState,
	action: SurfaceSessionAction
): SurfaceSessionState {
	switch (action.type) {
		case 'surface': {
			return action.surface === state.surface
				? state
				: leaveSurface(state, action.surface, true);
		}
		case 'navigate': {
			return leaveSurface(state, state.surface, true);
		}
		case 'commit': {
			return leaveSurface(state, state.surface, false);
		}
		case 'expand': {
			return state.surface !== 'banner' || state.expanded
				? state
				: { ...state, expanded: true };
		}
		case 'collapse': {
			return state.expanded || state.confirmation
				? { ...state, confirmation: null, expanded: false }
				: state;
		}
		case 'open-confirmation': {
			if (state.surface === 'none') {
				return state;
			}
			return { ...state, confirmation: { nudges: 0, right: action.right } };
		}
		case 'nudge-confirmation': {
			return state.confirmation
				? {
						...state,
						confirmation: {
							...state.confirmation,
							nudges: state.confirmation.nudges + 1,
						},
					}
				: state;
		}
		case 'close-confirmation': {
			return state.confirmation ? { ...state, confirmation: null } : state;
		}
		case 'toggle-receipt': {
			const open = action.open ?? !state.receiptOpen;
			return open === state.receiptOpen
				? state
				: { ...state, receiptOpen: open };
		}
		case 'push-sheet': {
			if (
				!canStack(state) ||
				// The main card is a layer too.
				state.sheets.length + 1 >= MAX_SURFACE_LAYERS ||
				state.sheets.some(({ id }) => id === action.id)
			) {
				return state;
			}
			// A new layer starts silent, and the confirmation stays with the
			// layer below (SR-02).
			return {
				...state,
				announcement: null,
				confirmation: null,
				sheets: [
					...state.sheets,
					{ id: action.id, opener: action.opener ?? null },
				],
			};
		}
		case 'pop-sheet': {
			if (state.sheets.length === 0) {
				return state;
			}
			// The closing layer's message must not be read again by the one
			// below (SR-02).
			return {
				...state,
				announcement: null,
				sheets: state.sheets.slice(0, -1),
			};
		}
		case 'announce': {
			return announce(state, action.message, action.layer);
		}
		case 'clear-announcement': {
			return state.announcement ? { ...state, announcement: null } : state;
		}
		case 'begin-copy': {
			return {
				...state,
				copy: { attempt: state.copy.attempt + 1, status: 'pending' },
			};
		}
		case 'finish-copy': {
			if (action.attempt !== state.copy.attempt) {
				return state;
			}
			return {
				...state,
				copy: {
					attempt: state.copy.attempt,
					status: action.ok ? 'copied' : 'failed',
				},
			};
		}
		case 'reset-copy': {
			return state.copy.status === 'idle'
				? state
				: { ...state, copy: { ...state.copy, status: 'idle' } };
		}
		default: {
			return state;
		}
	}
};
