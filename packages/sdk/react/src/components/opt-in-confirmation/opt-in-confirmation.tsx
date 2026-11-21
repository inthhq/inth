'use client';

import type { ConsentKernel } from '@inth/sdk/engine';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk/runtime/page-globals';
import {
	closeOptInConfirmation,
	confirmOptInConfirmation,
	isOptInConfirmationOpen,
	takeOptInConfirmationOpener,
} from '@inth/sdk/surface-actions';
import {
	resolveOptInConfirmationSentence,
	resolveOptOutCopy,
} from '@inth/sdk/surface-state';
import { onDialogDismiss } from '@inth/sdk/ui/primitives/dialog';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { findFocusRestoreEquivalent } from '@inth/sdk/ui/utils/dom';
import type { FC, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useTranslations } from '~/component-hooks/use-translations';
import { LocalThemeContext } from '~/context/theme-context';
import type { ThemeContextValue } from '~/context/theme-context';
import { useOptOutReceipt } from '~/hooks';
import { useFocusTrap } from '~/hooks/use-focus-trap';
import { useIsHydrated } from '~/hooks/use-is-hydrated';
import { useOptInConfirmationOpen } from '~/hooks/use-opt-out';
import { useScrollLock } from '~/hooks/use-scroll-lock';
import { useTextDirection } from '~/hooks/use-text-direction';
import { useTheme } from '~/hooks/use-theme';
import { useTranslationLanguage } from '~/hooks/use-translation-language';
import { useKernel } from '~/kernel-selector';
import { useUIConfig } from '~/ui-config-context';
import { cnExt as cn } from '~/utils/cn';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import { DIALOG_SHEETS } from '../shared/dialog-sheets';
import { SurfaceStyles, useSurfaceSheetsReady } from '../shared/surface-styles';

/** Props for the two-step opt-in confirmation dialog. */
export interface OptInConfirmationProps {
	/** Disables all animations when true. */
	disableAnimation?: boolean;
	/** Removes default styles when true. */
	noStyle?: boolean;
	/** Locks page scroll while open. Defaults to `true`. */
	scrollLock?: boolean;
	/** Traps keyboard focus while open. Defaults to `true`. */
	trapFocus?: boolean;
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
		if (focusLost && !isOptInConfirmationOpen(kernel)) {
			findFocusRestoreEquivalent(opener)?.focus({ preventScroll: true });
		}
	}, 0);
};

const useOptInVisibility = function useOptInVisibility(
	kernel: ConsentKernel,
	isOpen: boolean,
	disableAnimation: boolean,
	animationDuration: string | undefined
): boolean {
	const [isVisible, setIsVisible] = useState(false);
	const openerRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (isOpen) {
			const captured = takeOptInConfirmationOpener(kernel);
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

const getOverlayClass = function getOverlayClass(
	noStyle: boolean,
	disableAnimation: boolean,
	isVisible: boolean
): string | undefined {
	if (noStyle) {
		return undefined;
	}
	if (disableAnimation) {
		return styles.overlay;
	}
	return cn(
		styles.overlay,
		isVisible ? styles.overlayVisible : styles.overlayHidden
	);
};

const resolveOptInOptions = function resolveOptInOptions(
	local: OptInConfirmationProps,
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

interface OptInDialogCardProps {
	buttonProps: ReturnType<typeof mergeSlotProps>;
	cancelLabel: string;
	confirmLabel: string;
	noStyle: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	sentence: string;
	title: string;
}

const OptInDialogCard: FC<OptInDialogCardProps> = ({
	buttonProps,
	cancelLabel,
	confirmLabel,
	noStyle,
	onCancel,
	onConfirm,
	sentence,
	title,
}) => {
	const mode = noStyle ? undefined : 'stroke';
	const size = noStyle ? undefined : 'small';
	const variant = noStyle ? undefined : 'neutral';
	return (
		<div
			className={noStyle ? undefined : styles.card}
			data-testid="opt-in-confirmation-card"
			tabIndex={-1}
		>
			<div
				className={noStyle ? undefined : styles.header}
				data-testid="opt-in-confirmation-header"
			>
				<h2
					className={noStyle ? undefined : styles.title}
					data-testid="opt-in-confirmation-title"
					id="opt-in-confirmation-title"
				>
					{title}
				</h2>
			</div>
			<p
				className={noStyle ? undefined : styles.description}
				data-testid="opt-in-confirmation-description"
				id="opt-in-confirmation-description"
			>
				{sentence}
			</p>
			<div
				className={noStyle ? undefined : styles.footer}
				data-testid="opt-in-confirmation-footer"
			>
				<button
					type="button"
					data-mode={mode}
					data-size={size}
					data-variant={variant}
					{...buttonProps}
					data-testid="opt-in-confirmation-cancel-button"
					onClick={onCancel}
				>
					{cancelLabel}
				</button>
				<button
					type="button"
					data-mode={mode}
					data-size={size}
					data-variant={variant}
					{...buttonProps}
					data-testid="opt-in-confirmation-confirm-button"
					onClick={onConfirm}
				>
					{confirmLabel}
				</button>
			</div>
		</div>
	);
};

/**
 * Separate modal confirmation dialog for the second step of opting back in
 * under an opt-out policy (11 CCR §7028(a)).
 *
 * Focus starts on the cancel button ("Stay opted out"), both buttons have
 * equal prominence, and Escape cancels without saving.
 *
 * @internal
 */
export const OptInConfirmation: FC<OptInConfirmationProps> = (props) => {
	const kernel = useKernel();
	const globalTheme = useTheme();
	const { components } = useUIConfig();
	const translations = useTranslations();
	const receipt = useOptOutReceipt();
	const language = useTranslationLanguage();
	const textDirection = useTextDirection(language);
	const confirmationOpen = useOptInConfirmationOpen();

	const { disableAnimation, noStyle, scrollLock, trapFocus } =
		resolveOptInOptions(props, globalTheme);

	const sheetsReady = useSurfaceSheetsReady(DIALOG_SHEETS, noStyle);
	const isMounted = useIsHydrated();
	const isOpen = sheetsReady && confirmationOpen;

	const isVisible = useOptInVisibility(
		kernel,
		isOpen,
		disableAnimation,
		globalTheme.theme?.motion?.duration?.normal
	);
	const contentRef = useRef<HTMLDivElement>(null);

	const handleCancel = useCallback(() => {
		closeOptInConfirmation(kernel);
	}, [kernel]);

	const handleConfirm = useCallback(() => {
		void confirmOptInConfirmation(kernel);
	}, [kernel]);

	useFocusTrap(isOpen && trapFocus, contentRef as RefObject<HTMLElement>, {
		initialFocus: 'first-tabbable',
	});

	useEffect(() => {
		if (!isOpen) {
			return;
		}
		return onDialogDismiss(document.documentElement, handleCancel);
	}, [handleCancel, isOpen]);

	useScrollLock(isOpen && scrollLock);

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

	if (!isMounted || !isOpen) {
		return null;
	}

	const copy = resolveOptOutCopy(translations);
	const sentence = resolveOptInConfirmationSentence(translations, receipt);
	const buttonProps = mergeSlotProps(
		getSlotProps(components, 'button.secondary'),
		{
			baseClassName: buttonStyles.button,
			noStyle,
		}
	);
	const disableAnimationAttr = disableAnimation ? '' : undefined;

	return createPortal(
		<LocalThemeContext.Provider value={contextValue}>
			<SurfaceStyles
				sheets={DIALOG_SHEETS}
				noStyle={noStyle}
			/>
			<div
				aria-hidden="true"
				className={getOverlayClass(noStyle, disableAnimation, isVisible)}
				data-disable-animation={disableAnimationAttr}
				data-stacked=""
				data-state="open"
				data-testid="opt-in-confirmation-overlay"
				role="presentation"
			/>
			<div
				className={getPositionerClass(noStyle, disableAnimation, isVisible)}
				data-disable-animation={disableAnimationAttr}
				data-stacked=""
				data-state="open"
				dir={textDirection}
			>
				<div
					ref={contentRef}
					aria-describedby="opt-in-confirmation-description"
					aria-labelledby="opt-in-confirmation-title"
					aria-modal="true"
					className={
						noStyle ? undefined : getContentClass(disableAnimation, isVisible)
					}
					data-state="open"
					data-testid="opt-in-confirmation-root"
					{...{ [SURFACE_ROOT_ATTRIBUTE]: 'dialog' }}
					dir={textDirection}
					lang={language}
					// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Matches ConsentDialogRoot semantics and shared test ids.
					role="dialog"
					tabIndex={-1}
				>
					<OptInDialogCard
						buttonProps={buttonProps}
						cancelLabel={copy.optInCancel}
						confirmLabel={copy.optInConfirm}
						noStyle={noStyle}
						onCancel={handleCancel}
						onConfirm={handleConfirm}
						sentence={sentence}
						title={copy.optInTitle}
					/>
				</div>
			</div>
		</LocalThemeContext.Provider>,
		document.body
	);
};
