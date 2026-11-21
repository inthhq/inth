import type { ConsentSnapshot, Translations } from '@inth/sdk-core';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk-core/runtime/page-globals';
import {
	resolveOptOutCopy,
	resolveOptOutReceipt,
	resolveOptOutReceiptSentence,
	resolveOptOutState,
} from '@inth/sdk-core/surface-state';
import type {
	OptOutReceipt,
	OptOutReceiptData,
} from '@inth/sdk-core/surface-state';

import { classes } from '../generated/styles';
import { PREFERENCES_HASH } from '../page-actions';
import type { ConsentDialogOptions } from '../types';
import { resolveCopy } from './copy';
import { h, readDurationMs, supportsStartingStyle } from './dom';
import { setupFocusTrap, setupScrollLock } from './locks';
import {
	closeOptOutConfirmation,
	getOptOutReceiptData,
	isOptOutConfirmationOpen,
	readFocusedElement,
	takeOptOutConfirmationOpener,
} from './opt-out-confirmation-state';
import type { Surface, SurfaceContext } from './surface';

const DEFAULT_DURATION_MS = 200;

const formatRecordedAt = function formatRecordedAt(
	at: number,
	language: string | undefined
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

/** Test ids applied to the opt-out receipt definition list. */
export interface ReceiptDetailsTestIds {
	receipt: string;
	recordedAt: string;
	reference: string;
}

const CONFIRMATION_RECEIPT_TEST_IDS: ReceiptDetailsTestIds = {
	receipt: 'opt-out-confirmation-receipt',
	recordedAt: 'opt-out-confirmation-recorded-at',
	reference: 'opt-out-confirmation-reference',
};

export const buildReceiptDetails = function buildReceiptDetails(
	receipt: OptOutReceipt,
	optOutCopy: ReturnType<typeof resolveOptOutCopy>,
	language: string | undefined,
	styles: typeof classes.optOutConfirmation,
	noStyle: boolean,
	testIds: ReceiptDetailsTestIds = CONFIRMATION_RECEIPT_TEST_IDS
): HTMLDListElement | null {
	if (receipt.at === null && receipt.reference === null) {
		return null;
	}
	const rowClass = noStyle ? '' : styles.receiptRow;
	const labelClass = noStyle ? '' : styles.receiptLabel;
	const valueClass = noStyle ? '' : styles.receiptValue;
	const rows: HTMLElement[] = [];
	if (receipt.at !== null) {
		rows.push(
			h(
				'div',
				{ class: rowClass },
				h('dt', { class: labelClass }, optOutCopy.recordedLabel),
				h(
					'dd',
					{ class: valueClass },
					h(
						'time',
						{
							'data-testid': testIds.recordedAt,
							datetime: new Date(receipt.at).toISOString(),
						},
						formatRecordedAt(receipt.at, language)
					)
				)
			)
		);
	}
	if (receipt.reference !== null) {
		rows.push(
			h(
				'div',
				{ class: rowClass },
				h('dt', { class: labelClass }, optOutCopy.referenceLabel),
				h(
					'dd',
					{ class: valueClass },
					h(
						'code',
						{
							class: noStyle ? '' : styles.reference,
							'data-testid': testIds.reference,
						},
						receipt.reference
					)
				)
			)
		);
	}
	return h(
		'dl',
		{
			class: noStyle ? '' : styles.receipt,
			'data-testid': testIds.receipt,
		},
		...rows
	);
};

/**
 * The focused opt-out confirmation view.
 *
 * Shown after the visitor activates an opt-out link under an opt-out policy.
 * Displays the link title, an honored status line (`role="status"`), a receipt
 * naming scope, confirmed rights, time and local reference, a Done button and
 * a link to full preferences.
 */
// oxlint-disable-next-line max-lines-per-function -- Build, open, close and reconcile are one lifecycle.
export const createOptOutConfirmation = function createOptOutConfirmation(
	ctx: SurfaceContext,
	options: ConsentDialogOptions
): Surface {
	const styles = classes.optOutConfirmation;
	const { noStyle, slot } = ctx;
	const disableAnimation = options.disableAnimation ?? ctx.disableAnimation;

	let overlay: HTMLElement | null = null;
	let positioner: HTMLElement | null = null;
	let content: HTMLElement | null = null;
	let cleanups: (() => void)[] = [];
	let closeTimer: ReturnType<typeof setTimeout> | undefined;
	let opener: HTMLElement | null = null;
	let renderedFrom: {
		translations: ConsentSnapshot['translations'];
		policyRule: ConsentSnapshot['policyRule'];
		optOut: ConsentSnapshot['optOut'];
		receiptData: Readonly<OptOutReceiptData>;
		gpcActive: boolean;
		experiment: ConsentSnapshot['experiment'];
		optOutLinkVariant: string | undefined;
	} | null = null;

	const dismiss = function dismiss(): void {
		closeOptOutConfirmation(ctx.client.kernel);
	};

	const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && !event.defaultPrevented) {
			event.preventDefault();
			dismiss();
		}
	};

	const build = function build(snapshot: ConsentSnapshot): void {
		const optOutLinkVariant = ctx.client.presentation?.optOutLink;
		const copy = resolveCopy(snapshot, optOutLinkVariant);
		const bundle = snapshot.translations?.translations as
			| Partial<Translations>
			| undefined;
		const optOutCopy = resolveOptOutCopy(bundle);
		const optOutState = resolveOptOutState(snapshot);
		const receiptData = getOptOutReceiptData(ctx.client.kernel);
		const receipt = resolveOptOutReceipt(snapshot, receiptData);
		const receiptSentence = resolveOptOutReceiptSentence(bundle, receipt);
		const statusText =
			optOutState.via === 'signal'
				? optOutCopy.statusSignal
				: optOutCopy.statusRequest;
		const receiptDetails = buildReceiptDetails(
			receipt,
			optOutCopy,
			copy.language,
			styles,
			noStyle
		);

		const doneButton = slot(
			slot(
				h(
					'button',
					{
						class: noStyle ? '' : classes.button.button,
						'data-mode': noStyle ? undefined : 'filled',
						'data-size': noStyle ? undefined : 'small',
						'data-testid': 'opt-out-confirmation-done-button',
						'data-variant': noStyle ? undefined : 'primary',
						onclick: dismiss,
						type: 'button',
					},
					optOutCopy.done
				),
				'buttonPrimary'
			),
			'optOutConfirmationDoneButton'
		);

		const preferencesLink = slot(
			h(
				'a',
				{
					class: noStyle ? '' : styles.preferencesLink,
					'data-testid': 'opt-out-confirmation-preferences-link',
					href: PREFERENCES_HASH,
					onclick: (event: Event) => {
						event.preventDefault();
						ctx.client.openDialog();
					},
				},
				copy.controls.preferences
			),
			'optOutConfirmationPreferencesLink'
		);

		content = slot(
			h(
				'div',
				{
					'aria-describedby': 'opt-out-confirmation-description',
					'aria-labelledby': 'opt-out-confirmation-title',
					'aria-modal': 'true',
					class: noStyle ? '' : styles.container,
					'data-state': 'open',
					'data-testid': 'opt-out-confirmation-root',
					[SURFACE_ROOT_ATTRIBUTE]: 'dialog',
					dir: copy.dir,
					lang: copy.language,
					onkeydown: onKeyDown as EventListener,
					role: 'dialog',
				},
				slot(
					h(
						'div',
						{
							class: noStyle ? '' : styles.card,
							'data-testid': 'opt-out-confirmation-card',
							tabindex: '-1',
						},
						slot(
							h(
								'div',
								{
									class: noStyle ? '' : styles.header,
									'data-testid': 'opt-out-confirmation-header',
								},
								slot(
									h(
										'h2',
										{
											class: noStyle ? '' : styles.title,
											'data-testid': 'opt-out-confirmation-title',
											id: 'opt-out-confirmation-title',
										},
										copy.optOutLink.label
									),
									'optOutConfirmationTitle'
								)
							),
							'optOutConfirmationHeader'
						),
						slot(
							h(
								'p',
								{
									class: noStyle ? '' : styles.status,
									'data-testid': 'opt-out-confirmation-status',
									role: 'status',
								},
								statusText
							),
							'optOutConfirmationStatus'
						),
						slot(
							h(
								'p',
								{
									class: noStyle ? '' : styles.description,
									'data-testid': 'opt-out-confirmation-description',
									id: 'opt-out-confirmation-description',
								},
								receiptSentence
							),
							'optOutConfirmationDescription'
						),
						receiptDetails,
						slot(
							h(
								'div',
								{
									class: noStyle ? '' : styles.footer,
									'data-testid': 'opt-out-confirmation-footer',
								},
								doneButton,
								preferencesLink
							),
							'optOutConfirmationFooter'
						)
					),
					'optOutConfirmationCard'
				)
			),
			'optOutConfirmation'
		);

		positioner = h(
			'div',
			{
				class: noStyle ? '' : styles.root,
				'data-disable-animation': disableAnimation,
				'data-state': 'open',
				dir: copy.dir,
			},
			content
		);

		overlay = slot(
			h('div', {
				'aria-hidden': 'true',
				class: noStyle ? '' : styles.overlay,
				'data-disable-animation': disableAnimation,
				'data-state': 'open',
				'data-testid': 'opt-out-confirmation-overlay',
				role: 'presentation',
			}),
			'optOutConfirmationOverlay'
		);

		renderedFrom = {
			experiment: snapshot.experiment,
			gpcActive: snapshot.privacySignals.gpc.active,
			optOut: snapshot.optOut,
			optOutLinkVariant,
			policyRule: snapshot.policyRule,
			receiptData,
			translations: snapshot.translations,
		};
	};

	const removeNow = function removeNow(): void {
		if (closeTimer !== undefined) {
			clearTimeout(closeTimer);
			closeTimer = undefined;
		}
		for (const cleanup of cleanups) {
			cleanup();
		}
		cleanups = [];
		overlay?.remove();
		positioner?.remove();
		overlay = null;
		positioner = null;
		content = null;
		renderedFrom = null;
	};

	const setVisible = function setVisible(visible: boolean): void {
		if (noStyle || !(overlay && positioner && content)) {
			return;
		}
		const state = visible ? 'open' : 'closed';
		overlay.setAttribute('data-state', state);
		positioner.setAttribute('data-state', state);
		content.setAttribute('data-state', state);
		overlay.classList.toggle(styles.overlayVisible, visible);
		overlay.classList.toggle(styles.overlayHidden, !visible);
		positioner.classList.toggle(styles.dialogVisible, visible);
		positioner.classList.toggle(styles.dialogHidden, !visible);
		content.classList.toggle(styles.contentVisible, visible);
		content.classList.toggle(styles.contentHidden, !visible);
	};

	const open = function open(snapshot: ConsentSnapshot): void {
		const hadOpener = opener;
		removeNow();
		opener = takeOptOutConfirmationOpener(ctx.client.kernel) ?? hadOpener;
		const activeBeforeTrap = readFocusedElement();
		build(snapshot);
		if (!(overlay && positioner && content)) {
			return;
		}
		const flip = !(noStyle || disableAnimation || supportsStartingStyle());
		setVisible(!flip);
		if (!(noStyle || flip || disableAnimation)) {
			overlay.classList.add(styles.overlayEntering);
			positioner.classList.add(styles.dialogEntering);
			content.classList.add(styles.contentEntering);
		}
		ctx.root.append(overlay, positioner);
		document.addEventListener('keydown', onKeyDown);
		cleanups.push(
			() => document.removeEventListener('keydown', onKeyDown),
			setupScrollLock(),
			setupFocusTrap(content, { initialFocus: 'first-tabbable' })
		);
		// If the chunk loaded asynchronously and focus left the opener before
		// `setupFocusTrap` captured it, restore focus to the opener on close.
		if (opener && activeBeforeTrap !== opener) {
			const fallbackOpener = opener;
			cleanups.push(() => {
				setTimeout(() => {
					if (
						!isOptOutConfirmationOpen(ctx.client.kernel) &&
						ctx.client.getSnapshot().activeUI !== 'dialog' &&
						fallbackOpener.isConnected
					) {
						fallbackOpener.focus({ preventScroll: true });
					}
				}, 0);
			});
		}
		if (flip) {
			void positioner.offsetHeight;
			setVisible(true);
		}
	};

	const close = function close(): void {
		if (!positioner || closeTimer !== undefined) {
			return;
		}
		opener = null;
		for (const cleanup of cleanups) {
			cleanup();
		}
		cleanups = [];
		if (noStyle || disableAnimation) {
			removeNow();
			return;
		}
		const duration = readDurationMs(
			positioner,
			'--opt-out-confirmation-animation-duration',
			DEFAULT_DURATION_MS
		);
		setVisible(false);
		closeTimer = setTimeout(removeNow, duration);
	};

	return {
		destroy() {
			opener = null;
			removeNow();
		},
		sync(snapshot) {
			const shouldShow =
				isOptOutConfirmationOpen(ctx.client.kernel) &&
				snapshot.activeUI !== 'dialog' &&
				snapshot.policyRule.model !== 'iab' &&
				resolveOptOutState(snapshot).honored;
			if (!shouldShow) {
				close();
				return;
			}
			const optOutLinkVariant = ctx.client.presentation?.optOutLink;
			const receiptData = getOptOutReceiptData(ctx.client.kernel);
			if (
				positioner &&
				closeTimer === undefined &&
				renderedFrom &&
				renderedFrom.translations === snapshot.translations &&
				renderedFrom.policyRule === snapshot.policyRule &&
				renderedFrom.optOut === snapshot.optOut &&
				renderedFrom.receiptData === receiptData &&
				renderedFrom.gpcActive === snapshot.privacySignals.gpc.active &&
				renderedFrom.experiment === snapshot.experiment &&
				renderedFrom.optOutLinkVariant === optOutLinkVariant
			) {
				return;
			}
			open(snapshot);
		},
	};
};
