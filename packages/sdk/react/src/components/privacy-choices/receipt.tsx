'use client';

/**
 * The receipt under the rights rows: one line, a Details disclosure, and a
 * reference to copy (RCPT-*, CLIP-*, GPC-06).
 */

import { copySurfaceReference, resolveRightsReceipt } from '@inth/sdk/engine';
import type { ConsentComponentSlotKey } from '@inth/sdk/schema/config';
import { resolveRightsReceiptCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/privacy-choices';
import { useEffect, useRef } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { useSnapshot } from '~/hooks';
import { useKernel } from '~/kernel-selector';
import { useUIConfig } from '~/ui-config-context';
import { inertProps } from '~/utils/inert';
import { getSlotProps, mergeSlotProps } from '~/utils/merge-slot-props';

import {
	rightsBundleOf,
	useOptOutReceiptData,
	useSurfaceSession,
} from './use-surface-session';

/** How long the copy button shows its check. */
const COPIED_MS = 1500;

const cx = (noStyle: boolean | undefined, ...names: (string | undefined)[]) =>
	noStyle ? undefined : names.filter(Boolean).join(' ') || undefined;

const Check = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M20 6 9 17l-5-5" />
	</svg>
);

const CopyIcon = () => (
	<svg
		width="14"
		height="14"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<rect
			x="9"
			y="9"
			width="13"
			height="13"
			rx="2"
		/>
		<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
	</svg>
);

const Chevron = () => (
	<svg
		width="12"
		height="12"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="m6 9 6 6 6-6" />
	</svg>
);

/** Props for {@link RightsReceipt}. */
export interface RightsReceiptProps {
	/** Prefix for element ids in this layer (SR-05). */
	idPrefix: string;
	/** The site's name for `{business}`. */
	business?: string;
	slotKey?: ConsentComponentSlotKey;
	noStyle?: boolean;
	/**
	 * The receipt's panel shows although its banner is not expanded, as in
	 * an all-in-one side drawer, so a failed copy may still reveal the
	 * fallback field there.
	 */
	panelVisible?: boolean;
}

/**
 * The receipt (RCPT-01): "✓ Saved for this browser · Jan 15, 2026" with
 * Details, shown only once something is recorded or a GPC signal is
 * honored, and then read as live (GPC-06). It stays mounted and toggles
 * `data-open`, so the rows below never move or lose focus (RCPT-03).
 *
 * Copying the reference announces only after the clipboard accepted it.
 * When it fails, a labelled field holds the full reference; it takes focus
 * only if Details is still open (CLIP-01, CLIP-03). The surface session
 * tokens each attempt, so a late result is ignored (CLIP-02).
 *
 * @internal
 */
// oxlint-disable-next-line max-lines-per-function -- One receipt: its line, Details and copy feedback.
export const RightsReceipt = ({
	idPrefix,
	business,
	slotKey,
	noStyle,
	panelVisible,
}: RightsReceiptProps) => {
	const kernel = useKernel();
	const snapshot = useSnapshot();
	const translations = useTranslations();
	const { components } = useUIConfig();
	const { session, state } = useSurfaceSession();
	const local = useOptOutReceiptData();
	const fieldRef = useRef<HTMLInputElement>(null);
	const receipt = resolveRightsReceipt(snapshot, local);
	const copy = resolveRightsReceiptCopy(translations, {
		bundle: rightsBundleOf(snapshot, local),
		business,
		receipt,
	});
	const detailsOpen = state.receiptOpen && receipt.show;
	const { status } = state.copy;
	const ids = {
		details: `${idPrefix}-receipt-details`,
		field: `${idPrefix}-reference-field`,
		fieldLabel: `${idPrefix}-reference-field-label`,
	};

	// The check on the copy button goes after a moment.
	useEffect(() => {
		if (status !== 'copied') {
			return;
		}
		const timer = setTimeout(() => session.resetCopy(), COPIED_MS);
		return () => clearTimeout(timer);
	}, [status, session]);

	const copyReference = async () => {
		const { reference } = receipt;
		if (!reference) {
			return;
		}
		const finish = await copySurfaceReference(kernel, reference, undefined, {
			panelVisible,
		});
		if (!(finish.applied && finish.reveal)) {
			return;
		}
		const failed = session.getState().copy.status === 'failed';
		session.announce(failed ? copy.copyFailed : copy.copied);
		if (failed) {
			// The field renders with the failure; focus it once it has.
			requestAnimationFrame(() => {
				fieldRef.current?.focus({ preventScroll: true });
				fieldRef.current?.select();
			});
		}
	};

	const rootProps = mergeSlotProps(getSlotProps(components, slotKey), {
		baseClassName: [styles.disclosure, styles.bleed],
		noStyle,
	});

	return (
		<div
			{...rootProps}
			data-open={receipt.show}
			{...inertProps(!receipt.show)}
			data-receipt-kind={receipt.show ? receipt.kind : undefined}
			data-testid="consent-dialog-receipt"
			// Focusable from code only: the dialog opens on it after an opt-out.
			tabIndex={-1}
		>
			<div className={cx(noStyle, styles.disclosureInner)}>
				<div className={cx(noStyle, styles.receipt)}>
					<div className={cx(noStyle, styles.receiptLine)}>
						<span className={cx(noStyle, styles.receiptLead)}>
							<Check />
							<span>{copy.lead}</span>
						</span>
						<button
							type="button"
							className={cx(noStyle, styles.textButton)}
							aria-expanded={detailsOpen}
							aria-controls={ids.details}
							data-testid="consent-dialog-receipt-toggle"
							onClick={() => session.toggleReceipt()}
						>
							{copy.details}
							<span className={cx(noStyle, styles.chevron)}>
								<Chevron />
							</span>
						</button>
					</div>
					<div
						className={cx(noStyle, styles.disclosure)}
						id={ids.details}
						data-open={detailsOpen}
						{...inertProps(!detailsOpen)}
						data-testid="consent-dialog-receipt-details"
					>
						<div className={cx(noStyle, styles.disclosureInner)}>
							<div className={cx(noStyle, styles.receiptDetails)}>
								<ul>
									{copy.items.map((item) => (
										<li key={item.text}>
											{item.text}
											{item.source ? (
												<span className={cx(noStyle, styles.receiptMuted)}>
													{` · ${item.source}`}
												</span>
											) : null}
										</li>
									))}
								</ul>
								<div className={cx(noStyle, styles.receiptMuted)}>
									{copy.scope}
								</div>
								<div className={cx(noStyle, styles.receiptMuted)}>
									{copy.recorded}
									{receipt.kind === 'stored' && receipt.reference ? (
										<>
											{` · ${copy.referenceLabel} `}
											<span
												className={cx(noStyle, styles.reference)}
												title={receipt.reference}
											>
												{receipt.reference.slice(0, 8)}
												<button
													type="button"
													className={cx(noStyle, styles.copyButton)}
													aria-label={copy.copy}
													data-copied={status === 'copied' ? 'true' : undefined}
													data-testid="consent-dialog-copy-reference"
													onClick={() => {
														void copyReference();
													}}
												>
													{status === 'copied' ? <Check /> : <CopyIcon />}
												</button>
											</span>
										</>
									) : null}
								</div>
								{status === 'failed' && receipt.reference ? (
									<div>
										<label
											htmlFor={ids.field}
											id={ids.fieldLabel}
										>
											{copy.copyFailedLabel}
										</label>
										<input
											ref={fieldRef}
											id={ids.field}
											className={cx(noStyle, styles.referenceField)}
											type="text"
											readOnly
											value={receipt.reference}
											data-testid="consent-dialog-reference-field"
										/>
									</div>
								) : null}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
