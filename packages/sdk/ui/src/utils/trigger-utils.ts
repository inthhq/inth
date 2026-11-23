/**
 * Framework-agnostic behavior of the floating trigger that reopens
 * preferences: when it shows, which corner it sits in, how a drag picks
 * the next corner, the toolbar's item order and keyboard focus, and the
 * end of the snap animation.
 *
 * The pure parts live in `trigger-drag.model.ts` and the saved corner in
 * `trigger-position.store.ts`; this module re-exports them.
 *
 * @packageDocumentation
 */

import {
	DRAG_SLOP_PX,
	calculateCornerFromDrag,
	createInitialDragState,
} from './trigger-drag.model';
import type { CornerPosition, DragState } from './trigger-drag.model';
import { persistPosition } from './trigger-position.store';

export {
	createInitialDragState,
	isTriggerVisible,
	nextToolbarItem,
	toolbarOrder,
} from './trigger-drag.model';
export type {
	CornerPosition,
	DragState,
	TriggerToolbarItem,
	TriggerVisibilityState,
} from './trigger-drag.model';
export { getPersistedPosition } from './trigger-position.store';

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
