/**
 * Framework-agnostic behavior of the floating trigger that reopens
 * preferences: when it shows, which corner it sits in, how a drag picks
 * the next corner, the toolbar's item order and keyboard focus, and the
 * end of the snap animation.
 *
 * @packageDocumentation
 */

import type { ConsentDialogTriggerVisibility } from '@inth/sdk-schema/config';

/**
 * Corner position options for the trigger button.
 * The button can be positioned in any of the four viewport corners.
 */
export type CornerPosition =
	| 'bottom-right'
	| 'top-right'
	| 'bottom-left'
	| 'top-left';

/**
 * State representing an ongoing drag operation.
 */
export interface DragState {
	/** Whether a drag operation is currently in progress */
	isDragging: boolean;
	/** X coordinate where the drag started */
	startX: number;
	/** Y coordinate where the drag started */
	startY: number;
	/** Current X coordinate during drag */
	currentX: number;
	/** Current Y coordinate during drag */
	currentY: number;
}

/**
 * Configuration options for the trigger positioning utilities.
 */
export interface TriggerConfig {
	/** Default corner position */
	defaultPosition: CornerPosition;
	/** Offset from viewport edges in pixels */
	offset: number;
	/** Whether to persist position to localStorage */
	persistPosition: boolean;
	/** Storage key for position persistence */
	storageKey: string;
}

/**
 * Default configuration values for the trigger.
 */
export const DEFAULT_TRIGGER_CONFIG: TriggerConfig = {
	defaultPosition: 'bottom-right',
	offset: 20,
	persistPosition: true,
	storageKey: 'inth-trigger-position',
};

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

/**
 * Calculates which corner is nearest to the given coordinates.
 *
 * @param x - Current X coordinate (relative to viewport)
 * @param y - Current Y coordinate (relative to viewport)
 * @param viewportWidth - Width of the viewport
 * @param viewportHeight - Height of the viewport
 * @returns The nearest corner position
 *
 * @example
 * ```typescript
 * // Bottom-right corner of a 1920x1080 viewport
 * const corner = calculateNearestCorner(1500, 900, 1920, 1080);
 * // Returns: 'bottom-right'
 * ```
 */
export const calculateNearestCorner = function calculateNearestCorner(
	x: number,
	y: number,
	viewportWidth: number,
	viewportHeight: number
): CornerPosition {
	const isRight = x > viewportWidth / 2;
	const isBottom = y > viewportHeight / 2;

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
 * Calculates the new corner based on drag direction from the current corner.
 * A small drag in any direction will snap to the appropriate corner.
 * Fast swipes (high velocity) can trigger with smaller distances.
 *
 * @param currentCorner - The current corner position
 * @param dragX - Horizontal drag distance (positive = right, negative = left)
 * @param dragY - Vertical drag distance (positive = down, negative = up)
 * @param options - Optional configuration
 * @param options.threshold - Minimum drag distance to trigger a change (default: DRAG_THRESHOLD)
 * @param options.velocityX - Horizontal velocity in pixels/ms (optional)
 * @param options.velocityY - Vertical velocity in pixels/ms (optional)
 * @returns The new corner position based on drag direction
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

	// Determine the dominant direction of the drag
	const absDragX = Math.abs(dragX);
	const absDragY = Math.abs(dragY);
	const absVelocityX = Math.abs(velocityX);
	const absVelocityY = Math.abs(velocityY);

	// Check if velocity exceeds threshold (fast swipe)
	const hasVelocityX = absVelocityX >= VELOCITY_THRESHOLD;
	const hasVelocityY = absVelocityY >= VELOCITY_THRESHOLD;

	// For velocity-based movement, use a much smaller distance threshold
	const velocityDistanceThreshold = 10;

	// Determine if we should move in each direction
	const shouldMoveX =
		absDragX >= threshold ||
		(hasVelocityX && absDragX >= velocityDistanceThreshold);
	const shouldMoveY =
		absDragY >= threshold ||
		(hasVelocityY && absDragY >= velocityDistanceThreshold);

	// If no movement threshold met, stay in current corner
	if (!shouldMoveX && !shouldMoveY) {
		return currentCorner;
	}

	// Parse current corner state
	const isCurrentlyBottom = currentCorner.includes('bottom');
	const isCurrentlyRight = currentCorner.includes('right');

	// Calculate new position based on drag direction
	let isBottom = isCurrentlyBottom;
	let isRight = isCurrentlyRight;

	// Horizontal movement
	if (shouldMoveX) {
		isRight = dragX > 0;
	}

	// Vertical movement
	if (shouldMoveY) {
		isBottom = dragY > 0;
	}

	// Build the new corner
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
 * @param corner - The corner position to persist
 * @param storageKey - The localStorage key to use
 *
 * @remarks
 * Silently fails if localStorage is not available (e.g., in SSR or private browsing).
 */
export const persistPosition = function persistPosition(
	corner: CornerPosition,
	storageKey: string = DEFAULT_TRIGGER_CONFIG.storageKey
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
 * @param storageKey - The localStorage key to read from
 * @returns The persisted corner position, or null if not found/invalid
 *
 * @remarks
 * Returns null if localStorage is not available or the stored value is invalid.
 */
export const getPersistedPosition = function getPersistedPosition(
	storageKey: string = DEFAULT_TRIGGER_CONFIG.storageKey
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

/**
 * Creates an initial drag state object.
 *
 * @returns A DragState with isDragging false and all coordinates at 0
 */
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
 * @param state - The trigger's option and the consent state.
 * @returns `true` when the trigger should be on screen.
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
 * @param corner - The corner the toolbar sits in.
 * @param orientation - The toolbar's direction. A vertical toolbar puts
 * preferences first in a top corner.
 * @returns The two items in order.
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
 * @param orientation - The toolbar's direction.
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
