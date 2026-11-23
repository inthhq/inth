/**
 * The receipt under the rights rows: one line, a Details disclosure, and a
 * reference to copy (RCPT-*, CLIP-*, GPC-06), as `RightsReceipt` is in
 * `@inth/react`.
 *
 * @packageDocumentation
 * @internal
 */

import { resolveRightsReceipt, resolveRightsReceiptCopy } from '@inth/sdk-core';

import { classes as styles } from '../../generated/privacy-choices/dialog';
import type { BrowserSlotKey } from '../slots';
import { cx, el, icon } from './dom';
import type { PcRef } from './dom';
import { copySurfaceReference, getOptOutReceiptData } from './engine';
import { checkIcon, chevron, rightsBundleOf } from './shared';
import type { PcEnv } from './shared';

/** How long the copy button shows its check. */
const COPIED_MS = 1500;

const copyIcon = () =>
	icon(14, ['M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'], {
		rect: { height: '13', rx: '2', width: '13', x: '9', y: '9' },
	});

/** What {@link createRightsReceipt} renders each time. */
export interface RightsReceiptProps {
	/** Prefix for element ids in this layer (SR-05). */
	idPrefix: string;
	business?: string;
	slotKey?: BrowserSlotKey;
	/**
	 * The receipt's panel shows although its banner is not expanded, as in
	 * an all-in-one side drawer, so a failed copy may still reveal the
	 * fallback field there.
	 */
	panelVisible?: boolean;
}

/** One mounted receipt. */
export interface RightsReceiptPart {
	render: (env: PcEnv, props: RightsReceiptProps) => HTMLElement;
	after: (env: PcEnv) => void;
	dispose: () => void;
}

/**
 * The receipt (RCPT-01): "✓ Saved for this browser · Jan 15, 2026" with
 * Details, shown only once something is recorded or a GPC signal is
 * honored. It stays mounted and toggles `data-open`, so the rows below
 * never move or lose focus (RCPT-03). Copying the reference announces
 * only after the clipboard accepted it; when it fails, a labelled field
 * holds the reference and takes focus if Details is still open (CLIP-01,
 * CLIP-03). A late result is ignored (CLIP-02).
 */
// oxlint-disable-next-line max-lines-per-function -- One receipt: its line, Details and copy feedback.
export const createRightsReceipt =
	function createRightsReceipt(): RightsReceiptPart {
		const fieldRef: PcRef = { current: null };
		let copiedTimer: ReturnType<typeof setTimeout> | undefined;
		let fieldFrame = 0;
		let focusField = false;

		const render = function render(
			env: PcEnv,
			props: RightsReceiptProps
		): HTMLElement {
			const { kernel, snapshot, t, session, state, noStyle } = env;
			const local = getOptOutReceiptData(kernel);
			const receipt = resolveRightsReceipt(snapshot, local);
			const copy = resolveRightsReceiptCopy(t, {
				bundle: rightsBundleOf(snapshot, local),
				business: props.business,
				receipt,
			});
			const detailsOpen = state.receiptOpen && receipt.show;
			const { status } = state.copy;
			const ids = {
				details: `${props.idPrefix}-receipt-details`,
				field: `${props.idPrefix}-reference-field`,
				fieldLabel: `${props.idPrefix}-reference-field-label`,
			};

			const copyReference = async () => {
				const { reference } = receipt;
				if (!reference) {
					return;
				}
				const finish = await copySurfaceReference(
					kernel,
					reference,
					undefined,
					{
						panelVisible: props.panelVisible,
					}
				);
				if (!(finish.applied && finish.reveal)) {
					return;
				}
				const failed = session.getState().copy.status === 'failed';
				session.announce(failed ? copy.copyFailed : copy.copied);
				if (failed) {
					// The field renders with the failure; focus it once it has.
					focusField = true;
					env.rerender();
				}
			};

			const reference =
				receipt.kind === 'stored' && receipt.reference
					? [
							` · ${copy.referenceLabel} `,
							el(
								'span',
								{
									class: cx(noStyle, styles.reference),
									title: receipt.reference,
								},
								receipt.reference.slice(0, 8),
								el(
									'button',
									{
										'aria-label': copy.copy,
										class: cx(noStyle, styles.copyButton),
										'data-copied': status === 'copied' ? 'true' : undefined,
										'data-testid': 'consent-dialog-copy-reference',
										on: {
											click: () => {
												void copyReference();
											},
										},
										type: 'button',
									},
									status === 'copied' ? checkIcon() : copyIcon()
								)
							),
						]
					: [];

			const root = el(
				'div',
				{
					class: cx(noStyle, styles.disclosure, styles.bleed),
					'data-open': receipt.show ? 'true' : 'false',
					'data-receipt-kind': receipt.show ? receipt.kind : undefined,
					'data-testid': 'consent-dialog-receipt',
					inert: !receipt.show,
					// Focusable from code only: the dialog opens on it after an
					// opt-out.
					tabindex: '-1',
				},
				el(
					'div',
					{ class: cx(noStyle, styles.disclosureInner) },
					el(
						'div',
						{ class: cx(noStyle, styles.receipt) },
						el(
							'div',
							{ class: cx(noStyle, styles.receiptLine) },
							el(
								'span',
								{ class: cx(noStyle, styles.receiptLead) },
								checkIcon(),
								el('span', {}, copy.lead)
							),
							el(
								'button',
								{
									'aria-controls': ids.details,
									'aria-expanded': detailsOpen ? 'true' : 'false',
									class: cx(noStyle, styles.textButton),
									'data-testid': 'consent-dialog-receipt-toggle',
									on: { click: () => session.toggleReceipt() },
									type: 'button',
								},
								copy.details,
								el(
									'span',
									{ class: cx(noStyle, styles.chevron) },
									chevron('down', 12)
								)
							)
						),
						el(
							'div',
							{
								class: cx(noStyle, styles.disclosure),
								'data-open': detailsOpen ? 'true' : 'false',
								'data-testid': 'consent-dialog-receipt-details',
								id: ids.details,
								inert: !detailsOpen,
							},
							el(
								'div',
								{ class: cx(noStyle, styles.disclosureInner) },
								el(
									'div',
									{ class: cx(noStyle, styles.receiptDetails) },
									el(
										'ul',
										{},
										...copy.items.map((item) =>
											el(
												'li',
												{},
												item.text,
												item.source
													? el(
															'span',
															{ class: cx(noStyle, styles.receiptMuted) },
															` · ${item.source}`
														)
													: null
											)
										)
									),
									el(
										'div',
										{ class: cx(noStyle, styles.receiptMuted) },
										copy.scope
									),
									el(
										'div',
										{ class: cx(noStyle, styles.receiptMuted) },
										copy.recorded,
										...reference
									),
									status === 'failed' && receipt.reference
										? el(
												'div',
												{},
												el(
													'label',
													{ for: ids.field, id: ids.fieldLabel },
													copy.copyFailedLabel
												),
												el('input', {
													class: cx(noStyle, styles.referenceField),
													'data-testid': 'consent-dialog-reference-field',
													id: ids.field,
													readonly: true,
													ref: fieldRef,
													type: 'text',
													value: receipt.reference,
												})
											)
										: null
								)
							)
						)
					)
				)
			);
			return props.slotKey ? env.ctx.slot(root, props.slotKey) : root;
		};

		const after = function after(env: PcEnv): void {
			const { status } = env.state.copy;
			// The check on the copy button goes after a moment.
			if (status === 'copied' && copiedTimer === undefined) {
				copiedTimer = setTimeout(() => {
					copiedTimer = undefined;
					env.session.resetCopy();
				}, COPIED_MS);
			} else if (status !== 'copied' && copiedTimer !== undefined) {
				clearTimeout(copiedTimer);
				copiedTimer = undefined;
			}
			if (focusField) {
				focusField = false;
				cancelAnimationFrame(fieldFrame);
				fieldFrame = requestAnimationFrame(() => {
					fieldFrame = 0;
					const field = fieldRef.current as HTMLInputElement | null;
					field?.focus({ preventScroll: true });
					field?.select();
				});
			}
		};

		return {
			after,
			dispose() {
				if (copiedTimer !== undefined) {
					clearTimeout(copiedTimer);
					copiedTimer = undefined;
				}
				cancelAnimationFrame(fieldFrame);
				fieldFrame = 0;
			},
			render,
		};
	};
