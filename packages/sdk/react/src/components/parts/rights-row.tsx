'use client';

/**
 * The statutory rights row: a segmented control for selling, sharing and
 * targeted ads, the confirmation that opting back in needs, and the GPC
 * note. Shared by the Privacy Choices banner panels and the dialog.
 */

import {
	confirmSaleRight,
	pressSaleRight,
	resolveSaleRight,
} from '@inth/sdk/engine';
import type { RightOption, SaveUISource } from '@inth/sdk/engine';
import type { ConsentComponentSlotKey } from '@inth/sdk/schema/config';
import {
	resolvePrivacyChoicesCopy,
	resolveSaleAnnouncement,
	resolveSaleRightCopy,
} from '@inth/sdk/surface-state';
import type { SaleAnnouncementOutcome } from '@inth/sdk/surface-state';
import {
	revealInScrollBody,
	scheduleReveal,
} from '@inth/sdk/ui/primitives/surface';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { useTranslations } from '~/component-hooks/use-translations';
import { ConsentButton } from '~/components/shared/primitives/button';
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

/** Surfaces that render the rights row, by their test-id prefix. */
export type RightsRowSurface = 'consent-banner' | 'consent-dialog';

/**
 * The row's test ids on each surface, spelled out so each one matches
 * `internals/conformance/src/contract/test-ids.ts`.
 */
const ROW_TEST_IDS = {
	'consent-banner': {
		allow: 'consent-banner-right-option-sale-allow',
		confirm: 'consent-banner-confirm',
		confirmAllow: 'consent-banner-confirm-allow',
		confirmCancel: 'consent-banner-confirm-cancel',
		protect: 'consent-banner-right-option-sale-protect',
		row: 'consent-banner-rights-row-sale',
	},
	'consent-dialog': {
		allow: 'consent-dialog-right-option-sale-allow',
		confirm: 'consent-dialog-confirm',
		confirmAllow: 'consent-dialog-confirm-allow',
		confirmCancel: 'consent-dialog-confirm-cancel',
		protect: 'consent-dialog-right-option-sale-protect',
		row: 'consent-dialog-rights-row-sale',
	},
} as const satisfies Record<RightsRowSurface, Record<string, string>>;

/** Props for {@link SaleRightsRow}. */
export interface SaleRightsRowProps {
	/**
	 * Prefix for the row's element ids. Each layer that renders the row
	 * passes its own, so `aria-labelledby` never resolves into another
	 * layer (SR-05).
	 */
	idPrefix: string;
	/** The surface it renders on, which prefixes its test ids. */
	testIdPrefix: RightsRowSurface;
	/** The site's name for `{business}`. */
	business?: string;
	/** Surface the recorded choice is attributed to. */
	uiSource?: SaveUISource;
	/** The `components` part that styles the row. */
	slotKey?: ConsentComponentSlotKey;
	noStyle?: boolean;
	/** Called after the row recorded a choice, for the dialog's "Saved" cue. */
	onRecorded?: () => void;
}

const OPTIONS: readonly RightOption[] = ['protect', 'allow'];

const CheckIcon = (): ReactNode => (
	<svg
		width="13"
		height="13"
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

const cls = (noStyle: boolean | undefined, ...names: (string | undefined)[]) =>
	noStyle ? undefined : names.filter(Boolean).join(' ') || undefined;

/**
 * The sale row (LAW-01, RIGHT-01..06, GPC-03, GPC-04). Refusing applies in
 * one press; allowing a refusal, or any grant under opt-in, opens the
 * confirmation in place and records nothing until the visitor confirms
 * (LAW-02). Pressing Allow again while it is open nudges (RIGHT-04).
 *
 * Renders nothing when the policy has no category that decides sale.
 *
 * @internal
 */
export const SaleRightsRow = ({
	idPrefix,
	testIdPrefix,
	business,
	uiSource,
	slotKey,
	noStyle,
	onRecorded,
}: SaleRightsRowProps) => {
	const kernel = useKernel();
	const snapshot = useSnapshot();
	const translations = useTranslations();
	const { components } = useUIConfig();
	const { session, state } = useSurfaceSession();
	const receiptData = useOptOutReceiptData();
	const right = resolveSaleRight(snapshot);
	const confirmRef = useRef<HTMLDivElement>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const allowRef = useRef<HTMLButtonElement>(null);
	const open = state.confirmation?.right === 'sale';
	const nudges = open ? (state.confirmation?.nudges ?? 0) : 0;
	const wasOpen = useRef(open);

	// Focus follows the confirmation: Cancel when it opens (RIGHT-06), the
	// invoking Allow when it closes from inside it.
	useEffect(() => {
		const confirm = confirmRef.current;
		let cancelReveal: (() => void) | undefined;
		if (open && !wasOpen.current) {
			cancelRef.current?.focus({ preventScroll: true });
			// Bring the question into view in the scroll body only, once it
			// has started to open, unless the surface moved on (RIGHT-07,
			// LAY-05, PERM-16).
			const { token } = session.getState();
			cancelReveal = scheduleReveal(
				() => {
					if (confirm) {
						revealInScrollBody(confirm);
					}
				},
				{ isCurrent: () => session.isCurrent(token) }
			);
		} else if (
			!open &&
			wasOpen.current &&
			confirm &&
			(confirm.contains(document.activeElement) ||
				document.activeElement === document.body)
		) {
			allowRef.current?.focus({ preventScroll: true });
		}
		wasOpen.current = open;
		return cancelReveal;
	}, [open, session]);

	// Replay the shake on every nudge; the red ring stays until it closes.
	useEffect(() => {
		const confirm = confirmRef.current;
		if (!confirm || nudges === 0) {
			return;
		}
		confirm.dataset.nudged = 'false';
		void confirm.offsetWidth;
		confirm.dataset.nudged = 'true';
		cancelRef.current?.focus({ preventScroll: true });
	}, [nudges]);

	if (!right.available || right.category === null) {
		return null;
	}

	const { model } = snapshot.evaluationPolicy;
	const copy = resolveSaleRightCopy(translations, {
		bundle: rightsBundleOf(snapshot, receiptData),
		business,
		locked: right.locked,
		model,
		selected: right.selected,
		source: right.source,
	});
	const { nudge } = resolvePrivacyChoicesCopy(translations);
	const testIds = ROW_TEST_IDS[testIdPrefix];
	const ids = {
		cancel: `${idPrefix}-sale-confirm-cancel`,
		confirmDescription: `${idPrefix}-sale-confirm-description`,
		confirmTitle: `${idPrefix}-sale-confirm-title`,
		description: `${idPrefix}-sale-description`,
		panel: `${idPrefix}-sale-confirm`,
		title: `${idPrefix}-sale-title`,
	};
	const bundle = rightsBundleOf(snapshot, receiptData);
	/** Say what was recorded, ending in "Saved." (LAW-04). */
	const recorded = (outcome: SaleAnnouncementOutcome) => {
		session.announce(
			resolveSaleAnnouncement(translations, { bundle, model, outcome })
		);
		onRecorded?.();
	};
	const press = (option: RightOption) => {
		const { outcome } = pressSaleRight(kernel, option, { uiSource });
		if (outcome === 'nudge') {
			session.announce(nudge);
		} else if (outcome === 'apply-protect') {
			recorded('protect');
		} else if (outcome === 'apply-allow') {
			recorded('allow');
		} else if (outcome === 'record-default') {
			recorded('recorded');
		}
	};
	const rowProps = mergeSlotProps(getSlotProps(components, slotKey), {
		baseClassName: styles.right,
		noStyle,
	});

	return (
		<section
			{...rowProps}
			aria-labelledby={ids.title}
			data-testid={testIds.row}
		>
			<div>
				<h3
					className={cls(noStyle, styles.rightTitle)}
					id={ids.title}
				>
					{copy.title}
				</h3>
				{right.locked ? null : (
					<p
						className={cls(noStyle, styles.rightDescription)}
						id={ids.description}
					>
						{copy.description}
					</p>
				)}
			</div>
			{right.locked ? (
				<div
					className={cls(noStyle, styles.note)}
					id={ids.description}
				>
					<span>{copy.description}</span>
				</div>
			) : null}
			<div
				className={cls(noStyle, styles.segmented)}
				// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Pressed buttons in a group, never radios (RIGHT-01); a fieldset would bring its own border and legend.
				role="group"
				aria-label={copy.groupLabel}
				aria-describedby={ids.description}
				data-selected={right.selected === 'protect' ? '0' : '1'}
			>
				<span
					className={cls(noStyle, styles.segmentedThumb)}
					aria-hidden="true"
				/>
				{OPTIONS.map((option) => {
					const pressed = right.selected === option;
					return (
						<button
							key={option}
							ref={option === 'allow' ? allowRef : undefined}
							type="button"
							className={cls(noStyle, styles.segmentedOption)}
							aria-pressed={pressed}
							// Under GPC only the unselected option is disabled (GPC-03).
							aria-disabled={right.locked && !pressed ? true : undefined}
							data-right-option={option}
							data-testid={testIds[option]}
							onClick={() => press(option)}
						>
							<span
								className={cls(noStyle, styles.segmentedCheck)}
								aria-hidden="true"
							>
								<CheckIcon />
							</span>
							{option === 'protect' ? copy.protect : copy.allow}
						</button>
					);
				})}
			</div>
			<div
				className={cls(noStyle, expandStyles.panel, styles.bleed)}
				id={ids.panel}
				data-open={open}
				{...inertProps(!open)}
			>
				<div className={cls(noStyle, expandStyles.inner)}>
					<div
						ref={confirmRef}
						className={cls(noStyle, styles.confirm)}
						// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A labelled group, as the dialog's confirmation is; a fieldset would bring its own border and legend.
						role="group"
						aria-labelledby={ids.confirmTitle}
						aria-describedby={ids.confirmDescription}
						data-nudged={nudges > 0}
						data-testid={testIds.confirm}
					>
						<p
							className={cls(noStyle, styles.confirmTitle)}
							id={ids.confirmTitle}
						>
							{copy.confirmTitle}
						</p>
						<p
							className={cls(noStyle, styles.confirmDescription)}
							id={ids.confirmDescription}
						>
							{copy.confirmDescription}
						</p>
						<div className={cls(noStyle, styles.confirmActions)}>
							<ConsentButton
								ref={cancelRef}
								action="custom-consent"
								performDefaultAction={false}
								variant="neutral"
								mode="stroke"
								noStyle={noStyle}
								id={ids.cancel}
								data-testid={testIds.confirmCancel}
								onClick={() => session.closeConfirmation()}
							>
								{copy.confirmCancel}
							</ConsentButton>
							<ConsentButton
								action="custom-consent"
								performDefaultAction={false}
								variant="neutral"
								mode="stroke"
								noStyle={noStyle}
								data-testid={testIds.confirmAllow}
								onClick={() => {
									if (confirmSaleRight(kernel, { uiSource })) {
										recorded('allow');
									}
								}}
							>
								{copy.confirmAllow}
							</ConsentButton>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
};
