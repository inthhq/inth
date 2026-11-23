/**
 * The floating trigger's pure behavior: which corner a drag or swipe ends
 * in, whether the trigger shows, and the toolbar's item order and keyboard
 * focus.
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

/**
 * Minimum drag distance in pixels to trigger a corner change.
 * A small drag threshold makes the trigger feel more responsive.
 */
export const DRAG_THRESHOLD = 30;

/**
 * Minimum velocity (pixels/ms) to trigger a corner change.
 * Fast swipes should trigger even with smaller distances.
 */
export const VELOCITY_THRESHOLD = 0.15;

/** Movement past which a pointer sequence counts as a drag, not a click. */
export const DRAG_SLOP_PX = 5;

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
export const calculateCornerFromDrag = function calculateCornerFromDrag(
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
