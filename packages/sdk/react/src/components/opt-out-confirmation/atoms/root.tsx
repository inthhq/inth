'use client';

import type { ConsentKernel } from '@inth/sdk/engine';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import {
	claimOptOutConfirmationHost,
	closeOptOutConfirmation,
	isOptOutConfirmationOpen,
	takeOptOutConfirmationOpener,
} from '@inth/sdk/surface-actions';
import { onDialogDismiss } from '@inth/sdk/ui/primitives/dialog';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { findFocusRestoreEquivalent } from '@inth/sdk/ui/utils/dom';
import type { FC, HTMLAttributes, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { LocalThemeContext } from '~/context/theme-context';
import type { ThemeContextValue } from '~/context/theme-context';
import { useActiveUI, useModel, useOptOutState } from '~/hooks';
import { useFocusTrap } from '~/hooks/use-focus-trap';
import { useIsHydrated } from '~/hooks/use-is-hydrated';
import { useOptOutConfirmationOpen } from '~/hooks/use-opt-out';
import { useScrollLock } from '~/hooks/use-scroll-lock';
import { useTextDirection } from '~/hooks/use-text-direction';
import { useTheme } from '~/hooks/use-theme';
import { useTranslationLanguage } from '~/hooks/use-translation-language';
import type { CSSPropertiesWithVars } from '~/types/theme';
import { useKernel } from '~/use-kernel-selector';
import { useUIConfig } from '~/use-ui-config';
import { cnExt as cn } from '~/utils/cn-ext';
import { mergeSlotProps } from '~/utils/merge-slot-props';

import {
	SurfaceStyles,
	useSurfaceSheetsReady,
} from '../../shared/surface-styles';
import { WIDGET_SHEETS } from '../../shared/widget-sheets';
import { OptOutConfirmationOverlay } from './overlay';

/**
 * Props for {@link OptOutConfirmationRoot}.
 *
 * @public
 */
export interface OptOutConfirmationRootProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	/** Explicitly control visibility. Defaults to the opt-out confirmation state. */
	open?: boolean;
	/** Called when the confirmation view requests to close (Done or Escape). */
	onClose?: () => void;
	/** When true, removes default internal styles. */
	noStyle?: boolean;
	/** Disable entrance and exit animations. */
	disableAnimation?: boolean;
	/** Lock page scroll while open. Defaults to `true`. */
	scrollLock?: boolean;
	/** Trap keyboard focus while open. Defaults to `true`. */
	trapFocus?: boolean;
	/** Custom backdrop element, or `false` to render none. */
	overlay?: ReactNode | false;
	/**
	 * Marks an embedded host inside `ConsentDialog` so it does not claim the
	 * standalone host token.
	 *
	 * @internal
	 */
	embedded?: boolean;
}

const restoreOpenerFocus = function restoreOpenerFocus(
	kernel: ConsentKernel,
	opener: HTMLElement
): ReturnType<typeof setTimeout> {
	return setTimeout(() => {
		const active = document.activeElement;
		const focusLost =
			!active ||
			active === document.body ||
			active === document.documentElement;
		if (
			focusLost &&
			!isOptOutConfirmationOpen(kernel) &&
			kernel.getSnapshot().activeUI !== 'dialog'
		) {
			findFocusRestoreEquivalent(opener)?.focus({ preventScroll: true });
		}
	}, 0);
};

const useConfirmationVisibility = function useConfirmationVisibility(
	kernel: ConsentKernel,
	isOpen: boolean,
	disableAnimation: boolean,
	animationDuration: string | undefined
): boolean {
	const [isVisible, setIsVisible] = useState(false);
	const openerRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (isOpen) {
			const captured = takeOptOutConfirmationOpener(kernel);
			if (captured) {
				openerRef.current = captured;
			}
			const frame = requestAnimationFrame(() => setIsVisible(true));
			return () => cancelAnimationFrame(frame);
		}
		const fallbackOpener = openerRef.current;
		openerRef.current = null;
		const restoreTimer = fallbackOpener
			? restoreOpenerFocus(kernel, fallbackOpener)
			: undefined;
		if (disableAnimation) {
			const frame = requestAnimationFrame(() => setIsVisible(false));
			return () => {
				cancelAnimationFrame(frame);
				clearTimeout(restoreTimer);
			};
		}
		const duration = Number.parseInt(
			(animationDuration || '200ms').replace('ms', ''),
			10
		);
		const timer = setTimeout(() => setIsVisible(false), duration);
		return () => {
			clearTimeout(timer);
			clearTimeout(restoreTimer);
		};
	}, [isOpen, disableAnimation, animationDuration, kernel]);

	return isVisible;
};

const getPositionerClass = function getPositionerClass(
	noStyle: boolean,
	disableAnimation: boolean,
	isVisible: boolean
): string | undefined {
	if (noStyle) {
		return undefined;
	}
	if (disableAnimation) {
		return styles.root;
	}
	return cn(
		styles.root,
		isVisible ? styles.dialogVisible : styles.dialogHidden
	);
};

const getContentClass = function getContentClass(
	disableAnimation: boolean,
	isVisible: boolean
): string {
	if (disableAnimation) {
		return styles.container;
	}
	return cn(
		styles.container,
		isVisible ? styles.contentVisible : styles.contentHidden
	);
};

const resolveConfirmationOptions = function resolveConfirmationOptions(
	local: {
		disableAnimation?: boolean;
		noStyle?: boolean;
		scrollLock?: boolean;
		trapFocus?: boolean;
	},
	global: ThemeContextValue
) {
	return {
		disableAnimation:
			local.disableAnimation ?? global.disableAnimation ?? false,
		noStyle: local.noStyle ?? global.noStyle ?? false,
		scrollLock: local.scrollLock ?? global.scrollLock ?? true,
		trapFocus: local.trapFocus ?? global.trapFocus ?? true,
	};
};

const resolveConfirmationOpen = function resolveConfirmationOpen(params: {
	activeUI: string | null;
	confirmationOpen: boolean;
	honored: boolean;
	model: string | null;
	openProp: boolean | undefined;
	sheetsReady: boolean;
}): boolean {
	if (!params.sheetsReady) {
		return false;
	}
	if (params.openProp !== undefined) {
		return params.openProp;
	}
	return (
		params.confirmationOpen &&
		params.activeUI !== 'dialog' &&
		params.model !== 'iab' &&
		params.honored
	);
};

export const OptOutConfirmationRoot: FC<OptOutConfirmationRootProps> = ({
	children,
	open: openProp,
	onClose,
	noStyle: localNoStyle,
	disableAnimation: localDisableAnimation,
	scrollLock: localScrollLock,
	trapFocus: localTrapFocus,
	overlay,
	embedded = false,
	className,
	style,
	...rest
}) => {
	const kernel = useKernel();
	const globalTheme = useTheme();
	const { components } = useUIConfig();
	const activeUI = useActiveUI();
	const model = useModel();
	const optOutState = useOptOutState();
	const confirmationOpen = useOptOutConfirmationOpen();
	const language = useTranslationLanguage();
	const textDirection = useTextDirection(language);

	const { disableAnimation, noStyle, scrollLock, trapFocus } =
		resolveConfirmationOptions(
			{
				disableAnimation: localDisableAnimation,
				noStyle: localNoStyle,
				scrollLock: localScrollLock,
				trapFocus: localTrapFocus,
			},
			globalTheme
		);

	const sheetsReady = useSurfaceSheetsReady(WIDGET_SHEETS, noStyle);
	const isMounted = useIsHydrated();

	useEffect(() => {
		if (embedded) {
			return;
		}
		const token = Symbol('OptOutConfirmation');
		return claimOptOutConfirmationHost(kernel, token);
	}, [embedded, kernel]);

	const isOpen = resolveConfirmationOpen({
		activeUI,
		confirmationOpen,
		honored: optOutState.honored,
		model,
		openProp,
		sheetsReady,
	});

	const isVisible = useConfirmationVisibility(
		kernel,
		isOpen,
		disableAnimation,
		globalTheme.theme?.motion?.duration?.normal
	);
	const contentRef = useRef<HTMLDivElement>(null);

	const handleClose = useCallback(() => {
		closeOptOutConfirmation(kernel);
		onClose?.();
	}, [kernel, onClose]);

	useFocusTrap(isOpen && trapFocus, contentRef as RefObject<HTMLElement>, {
		initialFocus: 'first-tabbable',
	});

	useEffect(() => {
		if (!isOpen) {
			return;
		}
		return onDialogDismiss(document.documentElement, handleClose);
	}, [handleClose, isOpen]);

	useScrollLock(isOpen && scrollLock);

	const positionerClass = getPositionerClass(
		noStyle,
		disableAnimation,
		isVisible
	);

	const containerStyle = mergeSlotProps(
		components?.['opt-out-confirmation']?.root,
		{
			baseClassName: getContentClass(disableAnimation, isVisible),
			className,
			noStyle,
			style: style as CSSPropertiesWithVars<Record<string, never>>,
			...rest,
		}
	);

	const contextValue = useMemo<ThemeContextValue>(
		() => ({
			disableAnimation,
			noStyle,
			scrollLock,
			theme: globalTheme.theme,
			trapFocus,
		}),
		[disableAnimation, globalTheme.theme, noStyle, scrollLock, trapFocus]
	);

	if (!isMounted) {
		return null;
	}

	const renderedOverlay =
		overlay === false
			? null
			: (overlay ?? <OptOutConfirmationOverlay open={isOpen} />);

	return createPortal(
		<LocalThemeContext.Provider value={contextValue}>
			{isOpen && (
				<>
					<SurfaceStyles
						sheets={WIDGET_SHEETS}
						noStyle={noStyle}
					/>
					{renderedOverlay}
					<div
						className={positionerClass}
						data-disable-animation={disableAnimation ? '' : undefined}
						data-state="open"
						dir={textDirection}
					>
						<div
							ref={contentRef}
							{...containerStyle}
							aria-describedby="opt-out-confirmation-description"
							aria-labelledby="opt-out-confirmation-title"
							aria-modal="true"
							data-state="open"
							data-testid="opt-out-confirmation-root"
							{...{ [SURFACE_ROOT_ATTRIBUTE]: 'dialog' }}
							dir={textDirection}
							lang={language}
							// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Matches ConsentDialogRoot semantics and shared test ids.
							role="dialog"
							tabIndex={-1}
						>
							{children}
						</div>
					</div>
				</>
			)}
		</LocalThemeContext.Provider>,
		document.body
	);
};

export { OptOutConfirmationRoot as Root };
