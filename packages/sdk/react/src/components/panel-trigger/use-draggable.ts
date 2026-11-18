'use client';

import {
	calculateCornerFromDrag,
	createInitialDragState,
	getPersistedPosition,
	onSnapEnd,
	persistPosition as persistToStorage,
} from '@inth/sdk/ui/utils/trigger-utils';
import type {
	CornerPosition,
	DragState,
} from '@inth/sdk/ui/utils/trigger-utils';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseDraggableOptions {
	/**
	 * Default corner position.
	 * @default 'bottom-right'
	 */
	defaultPosition?: CornerPosition;

	/**
	 * Whether to persist position to localStorage.
	 * @default true
	 */
	persistPosition?: boolean;

	onPositionChange?: (position: CornerPosition) => void;
}

export interface UseDraggableReturn {
	corner: CornerPosition;

	isDragging: boolean;

	/** Whether transitioning to a new corner (for animation) */
	isSnapping: boolean;

	/** Whether the last interaction was a drag (moved more than threshold) */
	wasDragged: () => boolean;

	/** Event handlers to attach to the draggable element */
	handlers: {
		onPointerDown: (e: React.PointerEvent) => void;
		onPointerMove: (e: React.PointerEvent) => void;
		onPointerUp: (e: React.PointerEvent) => void;
		onPointerCancel: (e: React.PointerEvent) => void;
	};

	/** Current transform style for drag offset */
	dragStyle: React.CSSProperties;
}

/**
 * Hook for making an element draggable between viewport corners.
 *
 * @example
 * ```tsx
 * function DraggableButton() {
 *   const { corner, isDragging, handlers, dragStyle } = useDraggable({
 *     defaultPosition: 'bottom-right',
 *     persistPosition: true,
 *   });
 *
 *   return (
 *     <button
 *       {...handlers}
 *       style={dragStyle}
 *       className={cn(styles.button, styles[corner])}
 *     >
 *       Drag me
 *     </button>
 *   );
 * }
 * ```
 */
export const useDraggable = function useDraggable(
	options: UseDraggableOptions = {}
): UseDraggableReturn {
	const {
		defaultPosition = 'bottom-right',
		persistPosition = true,
		onPositionChange,
	} = options;

	const [corner, setCorner] = useState<CornerPosition>(() => {
		if (persistPosition && typeof window !== 'undefined') {
			const persisted = getPersistedPosition();
			if (persisted) {
				return persisted;
			}
		}
		return defaultPosition;
	});

	const [dragState, setDragState] = useState<DragState>(createInitialDragState);
	const [isSnapping, setIsSnapping] = useState(false);

	// Ref to track if we've moved enough to consider it a drag vs click
	const hasDraggedRef = useRef(false);
	const elementRef = useRef<HTMLElement | null>(null);
	// The element the handlers sit on, which carries the snapping class.
	const snapElementRef = useRef<HTMLElement | null>(null);
	// Track drag start time for velocity calculation
	const dragStartTimeRef = useRef<number>(0);

	const updateCorner = useCallback(
		(newCorner: CornerPosition) => {
			setCorner(newCorner);
			if (persistPosition) {
				persistToStorage(newCorner);
			}
			onPositionChange?.(newCorner);
		},
		[persistPosition, onPositionChange]
	);

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		// Only handle primary button (left click / single touch)
		if (e.button !== 0) {
			return;
		}

		// Capture pointer for tracking outside element
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		elementRef.current = e.target as HTMLElement;
		snapElementRef.current = e.currentTarget as HTMLElement;
		hasDraggedRef.current = false;
		dragStartTimeRef.current = Date.now();

		setDragState({
			currentX: e.clientX,
			currentY: e.clientY,
			isDragging: true,
			startX: e.clientX,
			startY: e.clientY,
		});

		setIsSnapping(false);
	}, []);

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		setDragState((prev: DragState) => {
			if (!prev.isDragging) {
				return prev;
			}

			const dx = Math.abs(e.clientX - prev.startX);
			const dy = Math.abs(e.clientY - prev.startY);
			if (dx > 5 || dy > 5) {
				hasDraggedRef.current = true;
			}

			return {
				...prev,
				currentX: e.clientX,
				currentY: e.clientY,
			};
		});
	}, []);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			if (elementRef.current) {
				elementRef.current.releasePointerCapture(e.pointerId);
			}

			setDragState((prev: DragState) => {
				if (!prev.isDragging) {
					return prev;
				}

				if (hasDraggedRef.current) {
					const dragX = e.clientX - prev.startX;
					const dragY = e.clientY - prev.startY;
					const dragDuration = Date.now() - dragStartTimeRef.current;

					// Pixels per millisecond.
					const velocityX = dragDuration > 0 ? dragX / dragDuration : 0;
					const velocityY = dragDuration > 0 ? dragY / dragDuration : 0;

					const newCorner = calculateCornerFromDrag(corner, dragX, dragY, {
						velocityX,
						velocityY,
					});

					if (newCorner !== corner) {
						setIsSnapping(true);
						updateCorner(newCorner);
					}
				}

				return createInitialDragState();
			});
		},
		[corner, updateCorner]
	);

	useEffect(() => {
		const element = snapElementRef.current;
		if (!(isSnapping && element)) {
			return;
		}
		return onSnapEnd(element, () => setIsSnapping(false));
	}, [isSnapping]);

	const handlePointerCancel = useCallback((e: React.PointerEvent) => {
		if (elementRef.current) {
			elementRef.current.releasePointerCapture(e.pointerId);
		}
		setDragState(createInitialDragState());
	}, []);

	const dragStyle: React.CSSProperties = dragState.isDragging
		? {
				transform: `translate(${dragState.currentX - dragState.startX}px, ${dragState.currentY - dragState.startY}px)`,
				transition: 'none',
			}
		: {};

	const wasDragged = useCallback(() => hasDraggedRef.current, []);

	return {
		corner,
		dragStyle,
		handlers: {
			onPointerCancel: handlePointerCancel,
			onPointerDown: handlePointerDown,
			onPointerMove: handlePointerMove,
			onPointerUp: handlePointerUp,
		},
		isDragging: dragState.isDragging,
		isSnapping,
		wasDragged,
	};
};
