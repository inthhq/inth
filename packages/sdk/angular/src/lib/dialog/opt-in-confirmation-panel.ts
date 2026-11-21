import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	untracked,
} from '@angular/core';
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
import { isDialogDismissKey, onDialogDismiss } from '@inth/sdk/ui/primitives';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import * as banner from '@inth/sdk/ui/styles/sheets/banner-deferred';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as dialog from '@inth/sdk/ui/styles/sheets/dialog';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';
import type { ClassNameStyle } from '@inth/sdk/ui/theme';
import {
	findFocusRestoreEquivalent,
	getTextDirection,
	resolveStyles,
	toStyleAttributeValue,
} from '@inth/sdk/ui/utils';

import { ConsentManager } from '../core/consent-manager';
import { ConsentStyles, SURFACE_SCOPES } from '../core/consent-styles';
import type { SurfaceStyleSheet } from '../core/consent-styles';
import { ConsentTheme } from '../core/consent-theme';
import { NoStyleScope, resolveNoStyle } from '../core/no-style';
import { InitialFocus } from '../overlay/dialog-focus';
import { FocusTrap } from '../overlay/focus-trap';
import { Portal } from '../overlay/portal';
import { ScrollLock } from '../overlay/scroll-lock';

const OPT_IN_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	banner,
	dialog,
];

/**
 * Separate modal confirmation dialog for the second step of opting back in
 * under an opt-out policy. Loaded lazily by `<inth-opt-in-confirmation>`.
 *
 * Focus starts on the cancel button, both buttons have equal prominence, and
 * Escape cancels without saving.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [FocusTrap, InitialFocus, Portal, ScrollLock],
	providers: [NoStyleScope],
	selector: 'inth-opt-in-confirmation-panel',
	template: `@if (active()) {
		<div
			inthPortal
			style="display: contents;"
		>
			<div
				aria-hidden="true"
				[class]="overlayClass()"
				[attr.data-disable-animation]="disableMotion() ? '' : null"
				data-stacked=""
				data-state="open"
				data-testid="opt-in-confirmation-overlay"
				role="presentation"
			></div>
			<div
				[class]="positionerClass()"
				[attr.data-disable-animation]="disableMotion() ? '' : null"
				data-stacked=""
				data-state="open"
				[attr.dir]="textDirection()"
			>
				<div
					[inthFocusTrap]="{
						enabled: resolvedTrapFocus(),
						initialFocus: 'first-tabbable',
					}"
					inthInitialFocus
					[inthScrollLock]="resolvedScrollLock()"
					aria-describedby="opt-in-confirmation-description"
					aria-labelledby="opt-in-confirmation-title"
					aria-modal="true"
					[class]="contentClass()"
					data-state="open"
					data-testid="opt-in-confirmation-root"
					data-inth-surface="dialog"
					[attr.dir]="textDirection()"
					[attr.lang]="language()"
					role="dialog"
					tabindex="-1"
					(keydown)="requestCancelOnEscape($event)"
				>
					<div
						[class]="resolvedNoStyle() ? '' : styles.card || ''"
						data-testid="opt-in-confirmation-card"
						tabindex="-1"
					>
						<div
							[class]="resolvedNoStyle() ? '' : styles.header || ''"
							data-testid="opt-in-confirmation-header"
						>
							<h2
								[class]="resolvedNoStyle() ? '' : styles.title || ''"
								data-testid="opt-in-confirmation-title"
								id="opt-in-confirmation-title"
							>
								{{ optOutCopy().optInTitle }}
							</h2>
						</div>
						<p
							[class]="resolvedNoStyle() ? '' : styles.description || ''"
							data-testid="opt-in-confirmation-description"
							id="opt-in-confirmation-description"
						>
							{{ sentence() }}
						</p>
						<div
							[class]="resolvedNoStyle() ? '' : styles.footer || ''"
							data-testid="opt-in-confirmation-footer"
						>
							<button
								type="button"
								[attr.data-mode]="resolvedNoStyle() ? null : 'stroke'"
								[attr.data-size]="resolvedNoStyle() ? null : 'small'"
								[attr.data-variant]="resolvedNoStyle() ? null : 'neutral'"
								[class]="buttonStyle().className || ''"
								[attr.style]="styleOf(buttonStyle())"
								data-testid="opt-in-confirmation-cancel-button"
								(click)="cancel()"
							>
								{{ optOutCopy().optInCancel }}
							</button>
							<button
								type="button"
								[attr.data-mode]="resolvedNoStyle() ? null : 'stroke'"
								[attr.data-size]="resolvedNoStyle() ? null : 'small'"
								[attr.data-variant]="resolvedNoStyle() ? null : 'neutral'"
								[class]="buttonStyle().className || ''"
								[attr.style]="styleOf(buttonStyle())"
								data-testid="opt-in-confirmation-confirm-button"
								(click)="confirm()"
							>
								{{ optOutCopy().optInConfirm }}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	}`,
})
export class OptInConfirmationPanel {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);

	readonly active = input(false);
	readonly noStyle = input<boolean | undefined>(undefined);
	readonly disableAnimation = input<boolean | undefined>(undefined);
	readonly scrollLock = input<boolean | undefined>(undefined);
	readonly trapFocus = input<boolean | undefined>(undefined);

	/** @internal */
	protected readonly styles = styles;

	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly disableMotion = computed(
		() => this.disableAnimation() ?? this.#theme.disableAnimation()
	);
	/** @internal */
	protected readonly resolvedScrollLock = computed(
		() => this.scrollLock() ?? this.#theme.scrollLock() ?? true
	);
	/** @internal */
	protected readonly resolvedTrapFocus = computed(
		() => this.trapFocus() ?? this.#theme.trapFocus() ?? true
	);

	/** @internal */
	protected readonly language = computed(
		() => this.#consent.translations()?.language ?? 'en'
	);
	/** @internal */
	protected readonly textDirection = computed(() =>
		getTextDirection(this.#consent.translations()?.language)
	);
	/** @internal */
	protected readonly optOutCopy = computed(() =>
		resolveOptOutCopy(this.#consent.copy())
	);
	/** @internal */
	protected readonly sentence = computed(() =>
		resolveOptInConfirmationSentence(
			this.#consent.copy(),
			this.#consent.optOutReceipt()
		)
	);

	/** @internal */
	protected readonly buttonStyle = computed(() => {
		const noStyle = this.resolvedNoStyle();
		return resolveStyles(
			'buttonSecondary',
			this.#theme.theme(),
			{ baseClassName: buttonStyles.button, noStyle },
			noStyle
		);
	});

	/** @internal */
	protected readonly overlayClass = computed(() => {
		if (this.resolvedNoStyle()) {
			return '';
		}
		if (this.disableMotion()) {
			return styles.overlay || '';
		}
		const motion = this.active()
			? styles.overlayVisible || ''
			: styles.overlayHidden || '';
		return [styles.overlay, motion].filter(Boolean).join(' ');
	});

	/** @internal */
	protected readonly positionerClass = computed(() => {
		if (this.resolvedNoStyle()) {
			return '';
		}
		if (this.disableMotion()) {
			return styles.root || '';
		}
		const motion = this.active()
			? styles.dialogVisible || ''
			: styles.dialogHidden || '';
		return [styles.root, motion].filter(Boolean).join(' ');
	});

	/** @internal */
	protected readonly contentClass = computed(() => {
		if (this.resolvedNoStyle()) {
			return '';
		}
		if (this.disableMotion()) {
			return styles.container || '';
		}
		const motion = this.active()
			? styles.contentVisible || ''
			: styles.contentHidden || '';
		return [styles.container, motion].filter(Boolean).join(' ');
	});

	#opener: HTMLElement | null = null;
	#restoreTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		effect(() => {
			this.#styles.ensure(
				OPT_IN_SHEETS,
				this.resolvedNoStyle(),
				SURFACE_SCOPES.dialog
			);
		});

		effect((onCleanup) => {
			if (!this.active()) {
				return;
			}
			onCleanup(
				onDialogDismiss(document.documentElement, () => {
					this.cancel();
				})
			);
		});

		effect(() => {
			const open = this.active();
			const kernel = untracked(this.#consent.kernel);
			if (open) {
				const captured = takeOptInConfirmationOpener(kernel);
				if (captured) {
					this.#opener = captured;
				}
				return;
			}
			const previous = this.#opener;
			this.#opener = null;
			if (!previous) {
				return;
			}
			clearTimeout(this.#restoreTimer);
			this.#restoreTimer = setTimeout(() => {
				const active = document.activeElement;
				const focusLost =
					!active ||
					active === document.body ||
					active === document.documentElement;
				if (focusLost && !isOptInConfirmationOpen(kernel)) {
					findFocusRestoreEquivalent(previous)?.focus({ preventScroll: true });
				}
			}, 0);
		});

		inject(DestroyRef).onDestroy(() => {
			clearTimeout(this.#restoreTimer);
		});
	}

	/** @internal */
	protected styleOf(style: ClassNameStyle): string | null {
		return toStyleAttributeValue(style.style) ?? null;
	}

	/** @internal */
	protected cancel(): void {
		closeOptInConfirmation(untracked(this.#consent.kernel));
	}

	/** @internal */
	protected confirm(): void {
		void confirmOptInConfirmation(untracked(this.#consent.kernel));
	}

	/** @internal */
	protected requestCancelOnEscape(event: KeyboardEvent): void {
		if (isDialogDismissKey(event.key) && !event.defaultPrevented) {
			event.preventDefault();
			this.cancel();
		}
	}
}
