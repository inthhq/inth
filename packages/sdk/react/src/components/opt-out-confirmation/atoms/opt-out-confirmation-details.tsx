'use client';

import { resolveOptOutCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import { forwardRef as createForwardRef } from 'react';
import type { HTMLAttributes } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { useOptOutState } from '~/hooks';
import { useTheme } from '~/hooks/use-theme';
import { useTranslationLanguage } from '~/hooks/use-translation-language';

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
		const receipt = useOptOutState();
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

export { OptOutConfirmationDetails as Details, OptOutConfirmationDetails };
