/**
 * The statutory rights row: a segmented control for selling, sharing and
 * targeted ads, the confirmation that opting back in needs, and the GPC
 * note. Shared by the banner's options and the dialog, as
 * `SaleRightsRow` is in `@inth/react`.
 *
 * @packageDocumentation
 * @internal
 */

import {
	resolvePrivacyChoicesCopy,
	resolveSaleAnnouncement,
	resolveSaleRight,
	resolveSaleRightCopy,
} from '@inth/sdk-core';
import type {
	RightOption,
	SaleAnnouncementOutcome,
	SaveUISource,
} from '@inth/sdk-core';
import {
	revealInScrollBody,
	scheduleReveal,
} from '@inth/sdk-ui/primitives/surface';

import { classes as styles } from '../../generated/ui/dialog';
import { classes as expandStyles } from '../../generated/ui/expand';
import type { BrowserSlotKey } from '../create-slot-applier';
import { checkIcon } from './check-icon';
import { consentButton } from './consent-button';
import { cx, el } from './el';
import type { PartRef } from './el';
import {
	confirmSaleRight,
	getOptOutReceiptData,
	pressSaleRight,
} from './engine';
import { activeElementOf } from './focus-first-in';
import { rightsBundleOf } from './part-env.model';
import type { PartEnv } from './part-env.model';

/** Surfaces that render the rights row, by their test-id prefix. */
export type RightsRowSurface = 'consent-banner' | 'consent-dialog';

/** What {@link createSaleRightsRow} renders each time. */
export interface SaleRightsRowProps {
	/** Prefix for the row's element ids, one per layer (SR-05). */
	idPrefix: string;
	testIdPrefix: RightsRowSurface;
	/** The site's name for `{business}`. */
	business?: string;
	uiSource?: SaveUISource;
	slotKey?: BrowserSlotKey;
	/** Called after the row recorded a choice, for the dialog's "Saved" cue. */
	onRecorded?: () => void;
}

/** One mounted rights row: render, then run its effects. */
export interface SaleRightsRow {
	render: (env: PartEnv, props: SaleRightsRowProps) => HTMLElement | null;
	/** Focus and reveal after the render is mounted. */
	after: (env: PartEnv) => void;
	dispose: () => void;
}

const OPTIONS: readonly RightOption[] = ['protect', 'allow'];

/**
 * The sale row (LAW-01, RIGHT-01..06, GPC-03, GPC-04). Refusing applies in
 * one press; allowing a refusal, or any grant under opt-in, opens the
 * confirmation in place and records nothing until the visitor confirms
 * (LAW-02). Pressing Allow again while it is open nudges (RIGHT-04).
 * Renders nothing when the policy has no category that decides sale.
 */
export const createSaleRightsRow =
	function createSaleRightsRow(): SaleRightsRow {
		const confirmRef: PartRef = { current: null };
		const cancelRef: PartRef = { current: null };
		const allowRef: PartRef = { current: null };
		let wasOpen = false;
		let lastNudges = 0;
		let cancelReveal: (() => void) | undefined;

		const render = function render(
			env: PartEnv,
			props: SaleRightsRowProps
		): HTMLElement | null {
			const { kernel, snapshot, t, session, state, noStyle } = env;
			const right = resolveSaleRight(snapshot);
			if (!right.available || right.category === null) {
				return null;
			}
			const open = state.confirmation?.right === 'sale';
			const nudges = open ? (state.confirmation?.nudges ?? 0) : 0;
			const { model } = snapshot.evaluationPolicy;
			const bundle = rightsBundleOf(snapshot, getOptOutReceiptData(kernel));
			const copy = resolveSaleRightCopy(t, {
				bundle,
				business: props.business,
				locked: right.locked,
				model,
				selected: right.selected,
				source: right.source,
			});
			const { nudge } = resolvePrivacyChoicesCopy(t);
			const prefix = props.testIdPrefix;
			const { idPrefix } = props;
			const ids = {
				cancel: `${idPrefix}-sale-confirm-cancel`,
				confirmDescription: `${idPrefix}-sale-confirm-description`,
				confirmTitle: `${idPrefix}-sale-confirm-title`,
				description: `${idPrefix}-sale-description`,
				panel: `${idPrefix}-sale-confirm`,
				title: `${idPrefix}-sale-title`,
			};
			/** Say what was recorded, ending in "Saved." (LAW-04). */
			const recorded = (outcome: SaleAnnouncementOutcome) => {
				session.announce(
					resolveSaleAnnouncement(t, { bundle, model, outcome })
				);
				props.onRecorded?.();
			};
			const press = (option: RightOption) => {
				const { outcome } = pressSaleRight(kernel, option, {
					uiSource: props.uiSource,
				});
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

			const row = el(
				'section',
				{
					'aria-labelledby': ids.title,
					class: cx(noStyle, styles.right),
					'data-testid': `${prefix}-rights-row-sale`,
				},
				el(
					'div',
					{},
					el(
						'h3',
						{ class: cx(noStyle, styles.rightTitle), id: ids.title },
						copy.title
					),
					right.locked
						? null
						: el(
								'p',
								{
									class: cx(noStyle, styles.rightDescription),
									id: ids.description,
								},
								copy.description
							)
				),
				right.locked
					? el(
							'div',
							{ class: cx(noStyle, styles.note), id: ids.description },
							el('span', {}, copy.description)
						)
					: null,
				el(
					'div',
					{
						'aria-describedby': ids.description,
						'aria-label': copy.groupLabel,
						class: cx(noStyle, styles.segmented),
						'data-selected': right.selected === 'protect' ? '0' : '1',
						role: 'group',
					},
					el('span', {
						'aria-hidden': 'true',
						class: cx(noStyle, styles.segmentedThumb),
					}),
					...OPTIONS.map((option) => {
						const pressed = right.selected === option;
						return el(
							'button',
							{
								'aria-disabled': right.locked && !pressed ? 'true' : undefined,
								'aria-pressed': pressed ? 'true' : 'false',
								class: cx(noStyle, styles.segmentedOption),
								'data-right-option': option,
								'data-testid': `${prefix}-right-option-sale-${option}`,
								on: { click: () => press(option) },
								ref: option === 'allow' ? allowRef : undefined,
								type: 'button',
							},
							el(
								'span',
								{
									'aria-hidden': 'true',
									class: cx(noStyle, styles.segmentedCheck),
								},
								checkIcon(13)
							),
							option === 'protect' ? copy.protect : copy.allow
						);
					})
				),
				el(
					'div',
					{
						class: cx(noStyle, expandStyles.panel, styles.bleed),
						'data-open': open ? 'true' : 'false',
						id: ids.panel,
						inert: !open,
					},
					el(
						'div',
						{ class: cx(noStyle, expandStyles.inner) },
						el(
							'div',
							{
								'aria-describedby': ids.confirmDescription,
								'aria-labelledby': ids.confirmTitle,
								class: cx(noStyle, styles.confirm),
								'data-nudged': nudges > 0 ? 'true' : 'false',
								'data-testid': `${prefix}-confirm`,
								ref: confirmRef,
								role: 'group',
							},
							el(
								'p',
								{
									class: cx(noStyle, styles.confirmTitle),
									id: ids.confirmTitle,
								},
								copy.confirmTitle
							),
							el(
								'p',
								{
									class: cx(noStyle, styles.confirmDescription),
									id: ids.confirmDescription,
								},
								copy.confirmDescription
							),
							el(
								'div',
								{ class: cx(noStyle, styles.confirmActions) },
								consentButton({
									attrs: {
										'data-testid': `${prefix}-confirm-cancel`,
										id: ids.cancel,
										on: { click: () => session.closeConfirmation() },
										ref: cancelRef,
									},
									children: [copy.confirmCancel],
									env,
									mode: 'stroke',
									variant: 'neutral',
								}),
								consentButton({
									attrs: {
										'data-testid': `${prefix}-confirm-allow`,
										on: {
											click: () => {
												if (
													confirmSaleRight(kernel, { uiSource: props.uiSource })
												) {
													recorded('allow');
												}
											},
										},
									},
									children: [copy.confirmAllow],
									env,
									mode: 'stroke',
									variant: 'neutral',
								})
							)
						)
					)
				)
			);
			return props.slotKey ? env.ctx.slot(row, props.slotKey) : row;
		};

		const after = function after(env: PartEnv): void {
			const { session, state } = env;
			const open = state.confirmation?.right === 'sale';
			const nudges = open ? (state.confirmation?.nudges ?? 0) : 0;
			const confirm = confirmRef.current;
			// Focus follows the confirmation: Cancel when it opens (RIGHT-06),
			// the invoking Allow when it closes from inside it.
			if (open && !wasOpen) {
				cancelRef.current?.focus({ preventScroll: true });
				// Bring the question into view in the scroll body only, once it
				// has started to open, unless the surface moved on (RIGHT-07,
				// LAY-05, PERM-16).
				const { token } = session.getState();
				cancelReveal?.();
				cancelReveal = scheduleReveal(
					() => {
						if (confirm) {
							revealInScrollBody(confirm);
						}
					},
					{ isCurrent: () => session.isCurrent(token) }
				);
			} else if (!open && wasOpen && confirm) {
				const active = activeElementOf(confirm);
				if (!active || confirm.contains(active) || active === document.body) {
					allowRef.current?.focus({ preventScroll: true });
				}
			}
			wasOpen = open;
			// Replay the shake on every nudge; the red ring stays until it closes.
			if (confirm && nudges > 0 && nudges !== lastNudges) {
				confirm.dataset.nudged = 'false';
				void confirm.offsetWidth;
				confirm.dataset.nudged = 'true';
				cancelRef.current?.focus({ preventScroll: true });
			}
			lastNudges = nudges;
		};

		return {
			after,
			dispose() {
				cancelReveal?.();
			},
			render,
		};
	};
