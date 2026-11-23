'use client';

import type * as CoreTypes from '@inth/sdk/engine';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import { onDialogDismiss } from '@inth/sdk/ui/primitives/dialog';
import styles from '@inth/sdk/ui/styles/components/iab-consent-dialog';
import { useEffect, useMemo } from 'react';
import type { FC, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { ConsentTrackingContext } from '~/context/consent-tracking-context';
import { LocalThemeContext } from '~/context/theme-context';
import { useSetActiveUI } from '~/hooks';
import { useFocusBlocking } from '~/hooks/use-focus-blocking';
import { useIABConsentManager } from '~/hooks/use-iab-manager';
import { useIsHydrated } from '~/hooks/use-is-hydrated';
import { useScrollLock } from '~/hooks/use-scroll-lock';
import { useTextDirection } from '~/hooks/use-text-direction';
import { useUIConfig } from '~/use-ui-config';
import { cnExt as cn } from '~/utils/cn-ext';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import { IAB_DIALOG_SHEETS } from '../../shared/iab-dialog-sheets';
import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '../../shared/surface-styles';
import { useExitTransition } from '../use-exit-transition';
import { IABConsentDialogOverlay } from './iab-panel-overlay';

const DEFAULT_MODELS: CoreTypes.Model[] = ['iab'];

interface IABConsentDialogRootProps {
	children: ReactNode;
	/**
	 * Control the open state. If omitted, follows activeUI === 'dialog' from context.
	 */
	open?: boolean;
	noStyle?: boolean;
	disableAnimation?: boolean;
	scrollLock?: boolean;
	trapFocus?: boolean;
	/**
	 * Which consent models this dialog responds to.
	 * @default ['iab']
	 */
	models?: CoreTypes.Model[];
	/**
	 * Override the UI source identifier sent with consent API calls.
	 * @default 'iab_dialog'
	 */
	uiSource?: string;
}

/**
 * Root component for the IAB Consent Dialog.
 *
 * @remarks
 * Handles portal rendering, visibility animations, scroll lock, and overlay.
 *
 * @public
 */
const IABConsentDialogRoot: FC<IABConsentDialogRootProps> = ({
	children,
	open,
	models = DEFAULT_MODELS,
	noStyle,
	disableAnimation,
	scrollLock,
	trapFocus,
	uiSource,
}) => {
	const {
		activeUI,
		language,
		iab: iabState,
		policyDialog,
		model,
	} = useIABConsentManager({
		preferences: {
			blocking: useFocusBlocking('preferences', scrollLock, trapFocus),
		},
	});
	const setActiveUI = useSetActiveUI();
	const { components } = useUIConfig();
	const textDirection = useTextDirection(language);

	const isMounted = useIsHydrated();

	const sheetsReady = useSurfaceSheetsReady(IAB_DIALOG_SHEETS, noStyle);
	const isOpen =
		sheetsReady &&
		model !== null &&
		models.includes(model) &&
		(open ?? activeUI === 'dialog');
	const isVisible = useExitTransition(isOpen, disableAnimation);
	const resolvedScrollLock = policyDialog.blocking;

	const contextValue = useMemo(
		() => ({
			disableAnimation,
			noStyle,
			scrollLock: resolvedScrollLock,
			trapFocus: resolvedScrollLock,
		}),
		[disableAnimation, noStyle, resolvedScrollLock]
	);

	useScrollLock(Boolean(isOpen && resolvedScrollLock));

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		return onDialogDismiss(document.documentElement, () => setActiveUI('none'));
	}, [isOpen, setActiveUI]);

	const themedStyle = mergeSlotProps(components?.['iab-dialog']?.root, {
		baseClassName: cn(
			styles.root,
			// oxlint-disable-next-line no-nested-ternary -- Preserve established branch order and control flow.
			disableAnimation
				? undefined
				: isVisible
					? styles.dialogVisible
					: styles.dialogHidden
		),
	});
	const trackingContextValue = useMemo(
		() => ({ uiSource: uiSource ?? 'iab_dialog' }),
		[uiSource]
	);

	if (!isMounted || !iabState?.config.enabled) {
		return null;
	}

	if (!isOpen && !isVisible) {
		return null;
	}

	const dialogContent = (
		<ConsentTrackingContext.Provider value={trackingContextValue}>
			<LocalThemeContext.Provider value={contextValue}>
				<SurfaceStyles
					sheets={IAB_DIALOG_SHEETS}
					noStyle={noStyle}
				/>
				<IABConsentDialogOverlay isOpen={isOpen} />
				<div
					{...themedStyle}
					data-testid="iab-consent-dialog-root"
					{...{ [SURFACE_ROOT_ATTRIBUTE]: 'dialog' }}
					dir={textDirection}
				>
					{children}
				</div>
			</LocalThemeContext.Provider>
		</ConsentTrackingContext.Provider>
	);

	return createPortal(dialogContent, document.body);
};

IABConsentDialogRoot.displayName = 'IABConsentDialogRoot';

export { IABConsentDialogRoot };
