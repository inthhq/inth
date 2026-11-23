'use client';

import type { KernelBranding } from '@inth/sdk/engine';
import type { ConsentDialogTriggerVisibility } from '@inth/sdk/schema/config';
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useConsentDialogTrigger } from '~/component-hooks/use-consent-dialog-trigger';
import { useBranding } from '~/hooks';
import { useIsHydrated } from '~/hooks/use-is-hydrated';

import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '../../shared/surface-styles';
import type { SurfaceStyleSheet } from '../../shared/surface-styles';
import { TRIGGER_SHEETS } from '../../shared/trigger-sheets';
import type { CornerPosition } from '../consent-dialog-trigger.model';
import { useDraggable } from '../use-draggable';
import type { UseDraggableReturn } from '../use-draggable';

export interface TriggerContextValue {
	corner: CornerPosition;
	isDragging: boolean;
	/** Whether transitioning to a new corner */
	isSnapping: boolean;
	/** Whether a click ends a drag; spends the guard. */
	endsDrag: UseDraggableReturn['endsDrag'];
	handlers: UseDraggableReturn['handlers'];
	/** Current transform style for drag offset */
	dragStyle: React.CSSProperties;
	/** Branding from consent manager */
	branding: KernelBranding;
	isOptOut: boolean;
	openDialog: () => void;
	isVisible: boolean;
}

const TriggerContext = createContext<TriggerContextValue | null>(null);

/**
 * Hook to access the trigger context.
 * Must be used within a ConsentDialogTrigger.Root component.
 */
export const useTriggerContext =
	function useTriggerContext(): TriggerContextValue {
		const context = useContext(TriggerContext);
		if (!context) {
			throw new Error(
				'ConsentDialogTrigger components must be used within a ConsentDialogTrigger.Root'
			);
		}
		return context;
	};

export interface TriggerRootProps {
	children: ReactNode;

	/**
	 * Default corner position for the trigger.
	 * @default 'bottom-right'
	 */
	defaultPosition?: CornerPosition;

	/**
	 * Whether to persist position in localStorage.
	 * @default true
	 */
	persistPosition?: boolean;

	/**
	 * Controls when the trigger is visible.
	 * @default 'always'
	 */
	showWhen?: ConsentDialogTriggerVisibility;

	/**
	 * Replaces the `showWhen` calculation with a host-computed value. The
	 * toolbar uses it so app-owned actions stay mounted while only the
	 * built-in preferences action follows the prompt state.
	 */
	visible?: boolean;

	onPositionChange?: (position: CornerPosition) => void;

	onClick?: () => void;
}

/** Nothing to load while the trigger is hidden. */
const NO_SHEETS: readonly SurfaceStyleSheet[] = [];

/**
 * Root component that provides context and handles positioning.
 *
 * @example
 * ```tsx
 * <ConsentDialogTrigger.Root>
 *   <ConsentDialogTrigger.Button>
 *     <ConsentDialogTrigger.Icon />
 *   </ConsentDialogTrigger.Button>
 * </ConsentDialogTrigger.Root>
 * ```
 */
export const TriggerRoot = ({
	children,
	defaultPosition = 'bottom-right',
	persistPosition: shouldPersist = true,
	showWhen = 'always',
	visible,
	onPositionChange,
	onClick,
}: TriggerRootProps): ReactNode => {
	const branding = useBranding();
	const {
		isOptOut,
		isVisible: computedVisible,
		openDialog,
	} = useConsentDialogTrigger({
		onClick,
		showWhen,
	});
	const isVisible = visible ?? computedVisible;

	const { corner, isDragging, isSnapping, endsDrag, handlers, dragStyle } =
		useDraggable({
			defaultPosition,
			onPositionChange,
			persistPosition: shouldPersist,
		});

	const mounted = useIsHydrated();
	// The trigger renders in the browser only, so its sheet is never in the
	// server HTML. It loads once the trigger is about to show, not while a
	// banner hides it, so a first visit spends no bytes on it before the
	// page's own images.
	const sheetsReady = useSurfaceSheetsReady(
		isVisible ? TRIGGER_SHEETS : NO_SHEETS
	);

	const contextValue = useMemo<TriggerContextValue>(
		() => ({
			branding,
			corner,
			dragStyle,
			endsDrag,
			handlers,
			isDragging,
			isOptOut,
			isSnapping,
			isVisible,
			openDialog,
		}),
		[
			branding,
			corner,
			dragStyle,
			endsDrag,
			handlers,
			isDragging,
			isOptOut,
			isSnapping,
			isVisible,
			openDialog,
		]
	);

	if (!mounted || !isVisible || !sheetsReady) {
		return null;
	}

	return createPortal(
		<TriggerContext.Provider value={contextValue}>
			<SurfaceStyles sheets={TRIGGER_SHEETS} />
			{children}
		</TriggerContext.Provider>,
		document.body
	);
};

TriggerRoot.displayName = 'ConsentDialogTrigger.Root';

export { TriggerContext };
