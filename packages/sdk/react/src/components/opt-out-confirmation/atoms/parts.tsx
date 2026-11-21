'use client';

import { closeOptOutConfirmation } from '@inth/sdk/surface-actions';
import {
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceiptSentence,
	resolvePreferenceControlLabels,
} from '@inth/sdk/surface-state';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { forwardRef as createForwardRef, isValidElement } from 'react';
import type {
	AnchorHTMLAttributes,
	ButtonHTMLAttributes,
	HTMLAttributes,
	MouseEvent,
	ReactNode,
	Ref,
} from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { Slot } from '~/components/shared/libs/slot';
import { Box } from '~/components/shared/primitives/box';
import type { BoxProps } from '~/components/shared/primitives/box';
import {
	useOptOutReceipt,
	useOptOutState,
	useResolvedPresentation,
	useSetActiveUI,
} from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import { useTranslationLanguage } from '~/hooks/use-translation-language';
import { useKernel } from '~/kernel-selector';
import { useUIConfig } from '~/ui-config-context';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

const PREFERENCES_HASH = '#inth-preferences';

const formatRecordedAt = function formatRecordedAt(
	at: number,
	language: string
): string {
	try {
		return new Intl.DateTimeFormat(language, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(at);
	} catch {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(at);
	}
};

const OptOutConfirmationCard = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.card}
		data-testid="opt-out-confirmation-card"
		slotKey="opt-out-confirmation.card"
		tabIndex={-1}
		{...props}
	>
		{children}
	</Box>
));
OptOutConfirmationCard.displayName = 'OptOutConfirmationCard';

const OptOutConfirmationHeader = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.header}
		data-testid="opt-out-confirmation-header"
		slotKey="opt-out-confirmation.header"
		{...props}
	>
		{children}
	</Box>
));
OptOutConfirmationHeader.displayName = 'OptOutConfirmationHeader';

const OptOutConfirmationTitle = createForwardRef<
	HTMLHeadingElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, asChild, ...props }, ref) => {
	const translations = useTranslations();
	const presentation = useResolvedPresentation();
	const optOutLink = resolveOptOutLink(translations, presentation?.optOutLink);
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.title}
			data-testid="opt-out-confirmation-title"
			id="opt-out-confirmation-title"
			slotKey="opt-out-confirmation.title"
			{...props}
			asChild
		>
			{asChild && isValidElement(children) ? (
				children
			) : (
				<h2>{children ?? optOutLink.label}</h2>
			)}
		</Box>
	);
});
OptOutConfirmationTitle.displayName = 'OptOutConfirmationTitle';

const OptOutConfirmationStatus = createForwardRef<
	HTMLParagraphElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, asChild, ...props }, ref) => {
	const translations = useTranslations();
	const optOutCopy = resolveOptOutCopy(translations);
	const optOutState = useOptOutState();
	const statusText =
		optOutState.via === 'signal'
			? optOutCopy.statusSignal
			: optOutCopy.statusRequest;
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.status}
			data-testid="opt-out-confirmation-status"
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Matches the shared p[role="status"] opt-out confirmation contract.
			role="status"
			slotKey="opt-out-confirmation.status"
			{...props}
			asChild
		>
			{asChild && isValidElement(children) ? (
				children
			) : (
				<p>{children ?? statusText}</p>
			)}
		</Box>
	);
});
OptOutConfirmationStatus.displayName = 'OptOutConfirmationStatus';

const OptOutConfirmationDescription = createForwardRef<
	HTMLParagraphElement,
	BoxProps
>(({ children, asChild, ...props }, ref) => {
	const translations = useTranslations();
	const receipt = useOptOutReceipt();
	const sentence = resolveOptOutReceiptSentence(translations, receipt);
	return (
		<Box
			ref={ref as Ref<HTMLDivElement>}
			baseClassName={styles.description}
			data-testid="opt-out-confirmation-description"
			id="opt-out-confirmation-description"
			slotKey="opt-out-confirmation.description"
			{...props}
			asChild
		>
			{asChild && isValidElement(children) ? (
				children
			) : (
				<p>{children ?? sentence}</p>
			)}
		</Box>
	);
});
OptOutConfirmationDescription.displayName = 'OptOutConfirmationDescription';

export interface OptOutConfirmationDetailsProps extends HTMLAttributes<HTMLDListElement> {
	noStyle?: boolean;
	recordedAtTestId?: string;
	referenceTestId?: string;
}

const OptOutConfirmationDetails = createForwardRef<
	HTMLDListElement,
	OptOutConfirmationDetailsProps
>(
	(
		{
			className,
			noStyle,
			recordedAtTestId = 'opt-out-confirmation-recorded-at',
			referenceTestId = 'opt-out-confirmation-reference',
			...props
		},
		ref
	) => {
		const receipt = useOptOutReceipt();
		const translations = useTranslations();
		const language = useTranslationLanguage();
		const optOutCopy = resolveOptOutCopy(translations);
		const { noStyle: contextNoStyle } = useTheme();
		const finalNoStyle = Boolean(noStyle ?? contextNoStyle);
		if (receipt.at === null && receipt.reference === null) {
			return null;
		}
		const dlClassName = finalNoStyle
			? className
			: [styles.receipt, className].filter(Boolean).join(' ');
		const rowClassName = finalNoStyle ? undefined : styles.receiptRow;
		const labelClassName = finalNoStyle ? undefined : styles.receiptLabel;
		const valueClassName = finalNoStyle ? undefined : styles.receiptValue;
		const refClassName = finalNoStyle ? undefined : styles.reference;
		return (
			<dl
				ref={ref}
				className={dlClassName}
				data-testid="opt-out-confirmation-receipt"
				{...props}
			>
				{receipt.at !== null && (
					<div className={rowClassName}>
						<dt className={labelClassName}>{optOutCopy.recordedLabel}</dt>
						<dd className={valueClassName}>
							<time
								dateTime={new Date(receipt.at).toISOString()}
								data-testid={recordedAtTestId}
							>
								{formatRecordedAt(receipt.at, language)}
							</time>
						</dd>
					</div>
				)}
				{receipt.reference !== null && (
					<div className={rowClassName}>
						<dt className={labelClassName}>{optOutCopy.referenceLabel}</dt>
						<dd className={valueClassName}>
							<code
								className={refClassName}
								data-testid={referenceTestId}
							>
								{receipt.reference}
							</code>
						</dd>
					</div>
				)}
			</dl>
		);
	}
);
OptOutConfirmationDetails.displayName = 'OptOutConfirmationDetails';

const OptOutConfirmationFooter = createForwardRef<
	HTMLDivElement,
	Omit<BoxProps, 'slotKey'>
>(({ children, ...props }, ref) => (
	<Box
		ref={ref as Ref<HTMLDivElement>}
		baseClassName={styles.footer}
		data-testid="opt-out-confirmation-footer"
		slotKey="opt-out-confirmation.footer"
		{...props}
	>
		{children}
	</Box>
));
OptOutConfirmationFooter.displayName = 'OptOutConfirmationFooter';

export interface OptOutConfirmationDoneButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	asChild?: boolean;
	noStyle?: boolean;
}

const OptOutConfirmationDoneButton = createForwardRef<
	HTMLButtonElement,
	OptOutConfirmationDoneButtonProps
>(
	(
		{ children, asChild, className, style, noStyle, onClick, ...props },
		ref
	) => {
		const kernel = useKernel();
		const translations = useTranslations();
		const optOutCopy = resolveOptOutCopy(translations);
		const { components } = useUIConfig();
		const { noStyle: contextNoStyle } = useTheme();
		const finalNoStyle = Boolean(noStyle ?? contextNoStyle);
		const primaryProps = mergeSlotProps(
			getSlotProps(components, 'button.primary'),
			{
				baseClassName: buttonStyles.button,
				noStyle: finalNoStyle,
			}
		);
		const mergedProps = mergeSlotProps(
			getSlotProps(components, 'opt-out-confirmation.doneButton'),
			{
				baseClassName: primaryProps.className,
				className,
				noStyle: finalNoStyle,
				style: { ...primaryProps.style, ...style },
			}
		);
		const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
			onClick?.(event);
			if (!event.defaultPrevented) {
				closeOptOutConfirmation(kernel);
			}
		};
		const Comp = asChild ? Slot : 'button';
		return (
			<Comp
				ref={ref}
				type={asChild ? undefined : 'button'}
				data-mode={finalNoStyle ? undefined : 'filled'}
				data-size={finalNoStyle ? undefined : 'small'}
				data-variant={finalNoStyle ? undefined : 'primary'}
				{...mergedProps}
				data-testid="opt-out-confirmation-done-button"
				onClick={handleClick}
				{...props}
			>
				{children ?? optOutCopy.done}
			</Comp>
		);
	}
);
OptOutConfirmationDoneButton.displayName = 'OptOutConfirmationDoneButton';

export interface OptOutConfirmationPreferencesLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
	asChild?: boolean;
	children?: ReactNode;
	noStyle?: boolean;
}

const OptOutConfirmationPreferencesLink = createForwardRef<
	HTMLAnchorElement,
	OptOutConfirmationPreferencesLinkProps
>(
	(
		{ children, asChild, className, style, noStyle, onClick, ...props },
		ref
	) => {
		const translations = useTranslations();
		const controls = resolvePreferenceControlLabels(translations);
		const setActiveUI = useSetActiveUI();
		const { components } = useUIConfig();
		const { noStyle: contextNoStyle } = useTheme();
		const mergedProps = mergeSlotProps(
			getSlotProps(components, 'opt-out-confirmation.preferencesLink'),
			{
				baseClassName: styles.preferencesLink,
				className,
				noStyle: Boolean(noStyle ?? contextNoStyle),
				style,
			}
		);
		const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
			onClick?.(event);
			if (!event.defaultPrevented) {
				event.preventDefault();
				setActiveUI('dialog');
			}
		};
		const Comp = asChild ? Slot : 'a';
		return (
			<Comp
				ref={ref}
				href={asChild ? undefined : PREFERENCES_HASH}
				{...mergedProps}
				data-testid="opt-out-confirmation-preferences-link"
				onClick={handleClick}
				{...props}
			>
				{children ?? controls.preferences}
			</Comp>
		);
	}
);
OptOutConfirmationPreferencesLink.displayName =
	'OptOutConfirmationPreferencesLink';

export {
	OptOutConfirmationCard as Card,
	OptOutConfirmationCard,
	OptOutConfirmationDescription as Description,
	OptOutConfirmationDescription,
	OptOutConfirmationDetails as Details,
	OptOutConfirmationDetails,
	OptOutConfirmationDoneButton as DoneButton,
	OptOutConfirmationDoneButton,
	OptOutConfirmationFooter as Footer,
	OptOutConfirmationFooter,
	OptOutConfirmationHeader as Header,
	OptOutConfirmationHeader,
	OptOutConfirmationPreferencesLink as PreferencesLink,
	OptOutConfirmationPreferencesLink,
	OptOutConfirmationStatus as Status,
	OptOutConfirmationStatus,
	OptOutConfirmationTitle as Title,
	OptOutConfirmationTitle,
};
