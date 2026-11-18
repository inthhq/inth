'use client';

import {
	createInitialDragState,
	createTriggerDrag,
	getPersistedPosition,
	onSnapEnd,
} from '@inth/sdk/ui/utils/trigger-utils';
import type {
	CornerPosition,
	DragState,
	TriggerDrag,
} from '@inth/sdk/ui/utils/trigger-utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

	/**
	 * Whether a click ends a drag rather than asking for something. Call it
	 * from each click handler; it spends the guard.
	 */
	endsDrag: TriggerDrag['endsDrag'];

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
	// The element the handlers sit on, which carries the snapping class.
	const snapElementRef = useRef<HTMLElement | null>(null);
	const latest = useRef({ corner, onPositionChange, persistPosition });
	useEffect(() => {
		latest.current = { corner, onPositionChange, persistPosition };
	});

	const dragRef = useRef<TriggerDrag | null>(null);
	// Created on first use, from an event handler.
	const drag = useCallback((): TriggerDrag => {
		if (dragRef.current) {
			return dragRef.current;
		}
		dragRef.current = createTriggerDrag({
			corner: () => latest.current.corner,
			onCorner: (next) => {
				latest.current.corner = next;
				setIsSnapping(true);
				setCorner(next);
				latest.current.onPositionChange?.(next);
			},
			onDrag: setDragState,
			persist: () => latest.current.persistPosition,
		});
		return dragRef.current;
	}, []);
	const handlers = useMemo(
		() => ({
			onPointerCancel: () => drag().pointerCancel(),
			onPointerDown: (e: React.PointerEvent) => {
				if (e.button === 0) {
					snapElementRef.current = e.currentTarget as HTMLElement;
					setIsSnapping(false);
				}
				drag().pointerDown(e);
			},
			onPointerMove: (e: React.PointerEvent) => drag().pointerMove(e),
			onPointerUp: (e: React.PointerEvent) => drag().pointerUp(e),
		}),
		[drag]
	);
	const endsDrag = useCallback<TriggerDrag['endsDrag']>(
		(event) => drag().endsDrag(event),
		[drag]
	);

	useEffect(() => {
		const element = snapElementRef.current;
		if (!(isSnapping && element)) {
			return;
		}
		return onSnapEnd(element, () => setIsSnapping(false));
	}, [isSnapping]);

	const dragStyle: React.CSSProperties = dragState.isDragging
		? {
				transform: `translate(${dragState.currentX - dragState.startX}px, ${dragState.currentY - dragState.startY}px)`,
				transition: 'none',
			}
		: {};

	return {
		corner,
		dragStyle,
		endsDrag,
		handlers,
		isDragging: dragState.isDragging,
		isSnapping,
	};
};
