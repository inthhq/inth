import type { ConsentSnapshot, Translations } from '@inth/sdk-core';
import { SURFACE_ROOT_ATTRIBUTE } from '@inth/sdk-core/runtime/page-globals';
import {
	resolveOptInConfirmationSentence,
	resolveOptOutCopy,
	resolveOptOutReceipt,
} from '@inth/sdk-core/surface-state';
import type { OptOutReceiptData } from '@inth/sdk-core/surface-state';
import { setupFocusTrap, setupScrollLock } from '@inth/sdk-ui/utils';

import type { ConsentDialogOptions } from '../consent-client.model';
import { classes } from '../generated/styles';
import { h, readDurationMs, supportsStartingStyle } from './dom';
import {
	closeOptInConfirmation,
	confirmOptInConfirmation,
	getOptOutReceiptData,
	isOptInConfirmationOpen,
	readFocusedElement,
	takeOptInConfirmationOpener,
} from './opt-out-confirmation-state';
import { resolveCopy } from './resolve-copy';
import type { Surface, SurfaceContext } from './surface.model';

const DEFAULT_DURATION_MS = 200;

/**
 * Separate modal confirmation dialog for the second step of opting back in
 * under an opt-out policy (11 CCR §7028(a)).
 *
 * Focus starts on the cancel button ("Stay opted out"), both buttons have
 * equal prominence, and Escape cancels without saving.
 */
// oxlint-disable-next-line max-lines-per-function -- Build, open, close and reconcile are one lifecycle.
export const createOptInConfirmation = function createOptInConfirmation(
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
		optOut: ConsentSnapshot['optOut'];
		receiptData: Readonly<OptOutReceiptData>;
	} | null = null;

	const cancel = function cancel(): void {
		closeOptInConfirmation(ctx.client.kernel);
	};

	const confirm = function confirm(): void {
		void confirmOptInConfirmation(ctx.client.kernel);
	};

	const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && !event.defaultPrevented) {
			event.preventDefault();
			cancel();
		}
	};

	const build = function build(snapshot: ConsentSnapshot): void {
		const copy = resolveCopy(snapshot);
		const bundle = snapshot.translations?.translations as
			| Partial<Translations>
			| undefined;
		const optOutCopy = resolveOptOutCopy(bundle);
		const receiptData = getOptOutReceiptData(ctx.client.kernel);
		const receipt = resolveOptOutReceipt(snapshot, receiptData);
		const sentence = resolveOptInConfirmationSentence(bundle, receipt);

		const cancelButton = slot(
			h(
				'button',
				{
					class: noStyle ? '' : classes.button.button,
					'data-mode': noStyle ? undefined : 'stroke',
					'data-size': noStyle ? undefined : 'small',
					'data-testid': 'opt-in-confirmation-cancel-button',
					'data-variant': noStyle ? undefined : 'neutral',
					onclick: cancel,
					type: 'button',
				},
				optOutCopy.optInCancel
			),
			'buttonSecondary'
		);

		const confirmButton = slot(
			h(
				'button',
				{
					class: noStyle ? '' : classes.button.button,
					'data-mode': noStyle ? undefined : 'stroke',
					'data-size': noStyle ? undefined : 'small',
					'data-testid': 'opt-in-confirmation-confirm-button',
					'data-variant': noStyle ? undefined : 'neutral',
					onclick: confirm,
					type: 'button',
				},
				optOutCopy.optInConfirm
			),
			'buttonSecondary'
		);

		content = h(
			'div',
			{
				'aria-describedby': 'opt-in-confirmation-description',
				'aria-labelledby': 'opt-in-confirmation-title',
				'aria-modal': 'true',
				class: noStyle ? '' : styles.container,
				'data-state': 'open',
				'data-testid': 'opt-in-confirmation-root',
				[SURFACE_ROOT_ATTRIBUTE]: 'dialog',
				dir: copy.dir,
				lang: copy.language,
				onkeydown: onKeyDown as EventListener,
				role: 'dialog',
			},
			h(
				'div',
				{
					class: noStyle ? '' : styles.card,
					'data-testid': 'opt-in-confirmation-card',
					tabindex: '-1',
				},
				h(
					'div',
					{
						class: noStyle ? '' : styles.header,
						'data-testid': 'opt-in-confirmation-header',
					},
					h(
						'h2',
						{
							class: noStyle ? '' : styles.title,
							'data-testid': 'opt-in-confirmation-title',
							id: 'opt-in-confirmation-title',
						},
						optOutCopy.optInTitle
					)
				),
				h(
					'p',
					{
						class: noStyle ? '' : styles.description,
						'data-testid': 'opt-in-confirmation-description',
						id: 'opt-in-confirmation-description',
					},
					sentence
				),
				h(
					'div',
					{
						class: noStyle ? '' : styles.footer,
						'data-testid': 'opt-in-confirmation-footer',
					},
					cancelButton,
					confirmButton
				)
			)
		);

		positioner = h(
			'div',
			{
				class: noStyle ? '' : styles.root,
				'data-disable-animation': disableAnimation,
				'data-stacked': '',
				'data-state': 'open',
				dir: copy.dir,
			},
			content
		);

		overlay = h('div', {
			'aria-hidden': 'true',
			class: noStyle ? '' : styles.overlay,
			'data-disable-animation': disableAnimation,
			'data-stacked': '',
			'data-state': 'open',
			'data-testid': 'opt-in-confirmation-overlay',
			role: 'presentation',
		});

		renderedFrom = {
			optOut: snapshot.optOut,
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
		opener = takeOptInConfirmationOpener(ctx.client.kernel) ?? hadOpener;
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
		if (opener && activeBeforeTrap !== opener) {
			const fallbackOpener = opener;
			cleanups.push(() => {
				setTimeout(() => {
					if (
						!isOptInConfirmationOpen(ctx.client.kernel) &&
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
			const shouldShow = isOptInConfirmationOpen(ctx.client.kernel);
			if (!shouldShow) {
				close();
				return;
			}
			const receiptData = getOptOutReceiptData(ctx.client.kernel);
			if (
				positioner &&
				closeTimer === undefined &&
				renderedFrom &&
				renderedFrom.translations === snapshot.translations &&
				renderedFrom.optOut === snapshot.optOut &&
				renderedFrom.receiptData === receiptData
			) {
				return;
			}
			open(snapshot);
		},
	};
};
