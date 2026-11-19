/**
 * Framework-agnostic behavior of the floating trigger that reopens
 * preferences: when it shows, which corner it sits in, how a drag picks
 * the next corner, the toolbar's item order and keyboard focus, and the
 * end of the snap animation.
 *
 * @packageDocumentation
 */

import type { ConsentDialogTriggerVisibility } from '@inth/sdk-schema/config';

/** Corner position options for the trigger button. */
export type CornerPosition =
	| 'bottom-right'
	| 'top-right'
	| 'bottom-left'
	| 'top-left';

/**
 * State representing an ongoing drag operation.
 */
export interface DragState {
	isDragging: boolean;
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
}

const STORAGE_KEY = 'inth-trigger-position';

/**
 * Minimum drag distance in pixels to trigger a corner change.
 * A small drag threshold makes the trigger feel more responsive.
 */
const DRAG_THRESHOLD = 30;

/**
 * Minimum velocity (pixels/ms) to trigger a corner change.
 * Fast swipes should trigger even with smaller distances.
 */
const VELOCITY_THRESHOLD = 0.15;

/** Movement past which a pointer sequence counts as a drag, not a click. */
const DRAG_SLOP_PX = 5;

/**
 * Calculates the new corner based on drag direction from the current corner.
 * A small drag in any direction will snap to the appropriate corner.
 * Fast swipes (high velocity) can trigger with smaller distances.
 *
 * @param dragX - Horizontal drag distance (positive = right, negative = left)
 * @param dragY - Vertical drag distance (positive = down, negative = up)
 * @param options.threshold - Minimum drag distance to trigger a change (default: DRAG_THRESHOLD)
 * @param options.velocityX - Horizontal velocity in pixels/ms (optional)
 * @param options.velocityY - Vertical velocity in pixels/ms (optional)
 *
 * @example
 * ```typescript
 * // Dragging left from bottom-right
 * const corner = calculateCornerFromDrag('bottom-right', -50, 0);
 * // Returns: 'bottom-left'
 *
 * // Fast swipe with velocity
 * const corner = calculateCornerFromDrag('bottom-right', -15, 0, {
 *   velocityX: 0.5, velocityY: 0
 * });
 * // Returns: 'bottom-left' (velocity overcomes small distance)
 * ```
 */
const calculateCornerFromDrag = function calculateCornerFromDrag(
	currentCorner: CornerPosition,
	dragX: number,
	dragY: number,
	options: {
		threshold?: number;
		velocityX?: number;
		velocityY?: number;
	} = {}
): CornerPosition {
	const { threshold = DRAG_THRESHOLD, velocityX = 0, velocityY = 0 } = options;

	const absDragX = Math.abs(dragX);
	const absDragY = Math.abs(dragY);
	const absVelocityX = Math.abs(velocityX);
	const absVelocityY = Math.abs(velocityY);

	const hasVelocityX = absVelocityX >= VELOCITY_THRESHOLD;
	const hasVelocityY = absVelocityY >= VELOCITY_THRESHOLD;

	const velocityDistanceThreshold = 10;

	const shouldMoveX =
		absDragX >= threshold ||
		(hasVelocityX && absDragX >= velocityDistanceThreshold);
	const shouldMoveY =
		absDragY >= threshold ||
		(hasVelocityY && absDragY >= velocityDistanceThreshold);

	if (!shouldMoveX && !shouldMoveY) {
		return currentCorner;
	}

	const isCurrentlyBottom = currentCorner.includes('bottom');
	const isCurrentlyRight = currentCorner.includes('right');

	let isBottom = isCurrentlyBottom;
	let isRight = isCurrentlyRight;

	if (shouldMoveX) {
		isRight = dragX > 0;
	}

	if (shouldMoveY) {
		isBottom = dragY > 0;
	}

	if (isBottom && isRight) {
		return 'bottom-right';
	}
	if (isBottom && !isRight) {
		return 'bottom-left';
	}
	if (!isBottom && isRight) {
		return 'top-right';
	}
	return 'top-left';
};

/**
 * Persists the trigger position to localStorage.
 *
 * @remarks
 * Silently fails if localStorage is not available (e.g., in SSR or private browsing).
 */
const persistPosition = function persistPosition(
	corner: CornerPosition,
	storageKey: string = STORAGE_KEY
): void {
	try {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(storageKey, corner);
		}
	} catch {
		// Silently fail - localStorage may not be available
	}
};

/**
 * Retrieves the persisted trigger position from localStorage.
 *
 * @remarks
 * Returns null if localStorage is not available or the stored value is invalid.
 */
export const getPersistedPosition = function getPersistedPosition(
	storageKey: string = STORAGE_KEY
): CornerPosition | null {
	try {
		if (typeof localStorage !== 'undefined') {
			const stored = localStorage.getItem(storageKey);
			if (
				stored === 'bottom-right' ||
				stored === 'top-right' ||
				stored === 'bottom-left' ||
				stored === 'top-left'
			) {
				return stored;
			}
		}
	} catch {
		// Silently fail - localStorage may not be available
	}
	return null;
};

export const createInitialDragState =
	function createInitialDragState(): DragState {
		return {
			currentX: 0,
			currentY: 0,
			isDragging: false,
			startX: 0,
			startY: 0,
		};
	};

/** Options for {@link createTriggerDrag}. */
export interface TriggerDragOptions {
	/** The corner the trigger sits in now. */
	corner: () => CornerPosition;
	/** Whether a new corner is saved for the next page load. */
	persist: () => boolean;
	/** Called with the corner a drag ends in, when it differs. */
	onCorner: (corner: CornerPosition) => void;
	/** Called as the drag state changes, to render the drag offset. */
	onDrag?: (state: DragState) => void;
}

/** The pointer event fields a drag reads. DOM and React events both fit. */
export type TriggerPointerEvent = Pick<
	PointerEvent,
	'button' | 'clientX' | 'clientY' | 'currentTarget' | 'pointerId' | 'target'
>;

/** The pointer handlers and click guard {@link createTriggerDrag} returns. */
export interface TriggerDrag {
	pointerDown: (event: TriggerPointerEvent) => void;
	pointerMove: (event: TriggerPointerEvent) => void;
	pointerUp: (event: TriggerPointerEvent) => void;
	/**
	 * Drop the drag in progress, for `pointercancel` or when the element it
	 * started on is replaced.
	 */
	pointerCancel: () => void;
	/**
	 * Whether a click is the end of a drag rather than a request. Call it
	 * from every click handler on the trigger: it spends the guard, so only
	 * the click that ends a drag is ignored. A keyboard click (Enter or
	 * Space, `detail` 0) is always a request.
	 */
	endsDrag: (event: Pick<MouseEvent, 'detail'>) => boolean;
}

/**
 * The trigger's drag between corners: pointer capture, the slop that
 * separates a drag from a click, the corner a drag or swipe ends in,
 * persistence, and the guard that keeps the click ending a drag from
 * opening anything.
 *
 * @example
 * ```ts
 * const drag = createTriggerDrag({
 *   corner: () => corner,
 *   persist: () => true,
 *   onCorner: (next) => {
 *     corner = next;
 *   },
 * });
 * button.addEventListener('pointerdown', drag.pointerDown);
 * button.addEventListener('click', (event) => {
 *   if (!drag.endsDrag(event)) openDialog();
 * });
 * ```
 */
export const createTriggerDrag = function createTriggerDrag(
	options: TriggerDragOptions
): TriggerDrag {
	let state = createInitialDragState();
	let dragged = false;
	let startedAt = 0;
	let captured: Element | null = null;
	let pointerId = -1;

	const update = (next: DragState): void => {
		state = next;
		options.onDrag?.(next);
	};
	const release = (): void => {
		try {
			captured?.releasePointerCapture?.(pointerId);
		} catch {
			// The pointer is gone, which ends its capture too.
		}
		captured = null;
	};

	return {
		endsDrag(event) {
			const ended = dragged && event.detail !== 0;
			dragged = false;
			return ended;
		},
		pointerCancel() {
			release();
			// No click follows a cancelled pointer to spend the guard.
			dragged = false;
			update(createInitialDragState());
		},
		pointerDown(event) {
			if (event.button !== 0) {
				return;
			}
			// Capture on the item pressed, so the click still lands on it.
			const target = event.target instanceof Element ? event.target : null;
			const item = target?.closest('button');
			const root =
				event.currentTarget instanceof Element ? event.currentTarget : null;
			captured = item && root?.contains(item) ? item : target;
			({ pointerId } = event);
			captured?.setPointerCapture?.(pointerId);
			dragged = false;
			startedAt = Date.now();
			update({
				currentX: event.clientX,
				currentY: event.clientY,
				isDragging: true,
				startX: event.clientX,
				startY: event.clientY,
			});
		},
		pointerMove(event) {
			if (!state.isDragging) {
				return;
			}
			if (
				Math.abs(event.clientX - state.startX) > DRAG_SLOP_PX ||
				Math.abs(event.clientY - state.startY) > DRAG_SLOP_PX
			) {
				dragged = true;
			}
			update({ ...state, currentX: event.clientX, currentY: event.clientY });
		},
		pointerUp(event) {
			release();
			if (!state.isDragging) {
				return;
			}
			const { startX, startY } = state;
			update(createInitialDragState());
			if (!dragged) {
				return;
			}
			const dragX = event.clientX - startX;
			const dragY = event.clientY - startY;
			const elapsed = Date.now() - startedAt;
			const corner = options.corner();
			const next = calculateCornerFromDrag(corner, dragX, dragY, {
				velocityX: elapsed > 0 ? dragX / elapsed : 0,
				velocityY: elapsed > 0 ? dragY / elapsed : 0,
			});
			if (next === corner) {
				return;
			}
			if (options.persist()) {
				persistPosition(next);
			}
			options.onCorner(next);
		},
	};
};

/** What decides whether the trigger is on screen. */
export interface TriggerVisibilityState {
	/** The `showWhen` option. */
	showWhen: ConsentDialogTriggerVisibility;
	/** Whether a preferences control has somewhere to go. */
	hasConsentPreferences: boolean;
	/** Whether the preference dialog is open. */
	dialogOpen: boolean;
	/** Whether the policy still owes a prompt: a choice or a notice. */
	promptOwed: boolean;
}

/**
 * Whether the trigger renders.
 *
 * @remarks
 * Hidden with no resolved policy to manage, while the dialog it opens is
 * open, and for `never`. `after-consent` also waits until no prompt is
 * owed: a choice saved or a notice dismissed. Otherwise the trigger stays
 * on screen beside an open banner.
 *
 * @example
 * ```ts
 * isTriggerVisible({
 *   showWhen: 'after-consent',
 *   hasConsentPreferences: true,
 *   dialogOpen: false,
 *   promptOwed: true,
 * }); // false
 * ```
 */
export const isTriggerVisible = function isTriggerVisible(
	state: TriggerVisibilityState
): boolean {
	if (
		!state.hasConsentPreferences ||
		state.dialogOpen ||
		state.showWhen === 'never'
	) {
		return false;
	}
	return state.showWhen === 'always' || !state.promptOwed;
};

/** An item of the trigger toolbar. */
export type TriggerToolbarItem = 'preferences' | 'devtools';

/**
 * The toolbar's items in reading order for a corner. Preferences sits in
 * the corner; DevTools, a development aid, sits farthest from it.
 *
 * @param orientation - The toolbar's direction. A vertical toolbar puts
 * preferences first in a top corner.
 */
export const toolbarOrder = function toolbarOrder(
	corner: CornerPosition,
	orientation: 'horizontal' | 'vertical' = 'horizontal'
): readonly [TriggerToolbarItem, TriggerToolbarItem] {
	const preferencesFirst =
		orientation === 'horizontal'
			? corner.endsWith('left')
			: corner.startsWith('top');
	return preferencesFirst
		? ['preferences', 'devtools']
		: ['devtools', 'preferences'];
};

/**
 * The toolbar item a key moves focus to, for a roving tab stop. Arrow
 * keys along `orientation` step and wrap; Home and End jump to the ends.
 *
 * @param items - The focusable items in visual order.
 * @param current - The item that has the tab stop.
 * @param key - `KeyboardEvent.key`.
 * @returns The item to focus, or `undefined` for a key the toolbar ignores.
 *
 * @example
 * ```ts
 * nextToolbarItem(['devtools', 'preferences'], 'preferences', 'ArrowRight');
 * // 'devtools'
 * ```
 */
export const nextToolbarItem = function nextToolbarItem<Item>(
	items: readonly Item[],
	current: Item | undefined,
	key: string,
	orientation: 'horizontal' | 'vertical' = 'horizontal'
): Item | undefined {
	if (items.length === 0) {
		return undefined;
	}
	const index = current === undefined ? -1 : items.indexOf(current);
	const vertical = orientation === 'vertical';
	if (key === 'Home') {
		return items[0];
	}
	if (key === 'End') {
		return items.at(-1);
	}
	if (key === (vertical ? 'ArrowDown' : 'ArrowRight')) {
		return items[(index + 1) % items.length];
	}
	if (key === (vertical ? 'ArrowUp' : 'ArrowLeft')) {
		return items[(Math.max(index, 0) - 1 + items.length) % items.length];
	}
	return undefined;
};

/** Longest `transition-duration` plus `transition-delay` on `element`, in ms. */
const longestTransition = function longestTransition(element: Element): number {
	const style = getComputedStyle(element);
	const toMs = (value: string | undefined): number[] =>
		(value ?? '').split(',').map((part) => {
			const trimmed = part.trim();
			const amount = Number.parseFloat(trimmed);
			if (!Number.isFinite(amount)) {
				return 0;
			}
			return trimmed.endsWith('ms') ? amount : amount * 1000;
		});
	const durations = toMs(style.transitionDuration);
	const delays = toMs(style.transitionDelay);
	return Math.max(
		0,
		...durations.map((duration, index) => duration + (delays[index] ?? 0))
	);
};

/**
 * Calls `done` once the trigger's snap to a corner has finished.
 *
 * @remarks
 * Call it after the snapping class and the new corner are on the element.
 * It waits for the element's own `transitionend`, so a theme that changes
 * `--cdt-snap-duration` changes the wait too. When no transition runs
 * (`disableAnimation`, reduced motion, or no stylesheet), no event fires;
 * a timer set from the computed transition time ends the wait instead.
 *
 * @param element - The trigger or toolbar element.
 * @param done - Called once, when the snap has finished.
 * @returns A function that cancels the wait without calling `done`.
 */
export const onSnapEnd = function onSnapEnd(
	element: HTMLElement,
	done: () => void
): () => void {
	const listeners = new AbortController();
	const longest = longestTransition(element);
	// A little past the transition's end, for a snap that moved nothing.
	const timer = setTimeout(
		() => {
			listeners.abort();
			done();
		},
		longest > 0 ? longest + 50 : 0
	);
	const cancel = (): void => {
		clearTimeout(timer);
		listeners.abort();
	};
	const onEnd = (event: Event): void => {
		if (event.target === element) {
			cancel();
			done();
		}
	};
	element.addEventListener('transitionend', onEnd, listeners);
	element.addEventListener('transitioncancel', onEnd, listeners);
	return cancel;
};
