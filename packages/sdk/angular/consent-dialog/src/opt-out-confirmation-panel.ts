import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	output,
	untracked,
} from '@angular/core';
import {
	ConsentManager,
	ConsentStyles,
	ConsentTheme,
	FocusTrap,
	Portal,
	ScrollLock,
	SURFACE_SCOPES,
	ɵInitialFocus as InitialFocus,
	ɵNoStyleScope as NoStyleScope,
	ɵresolveNoStyle as resolveNoStyle,
} from '@inth/angular';
import { WIDGET_SHEETS } from '@inth/angular/consent-widget';
import {
	closeOptOutConfirmation,
	isOptOutConfirmationOpen,
	takeOptOutConfirmationOpener,
} from '@inth/sdk/surface-actions';
import {
	resolveOptOutCopy,
	resolveOptOutLink,
	resolveOptOutReceiptSentence,
	resolvePreferenceControlLabels,
} from '@inth/sdk/surface-state';
import { isDialogDismissKey, onDialogDismiss } from '@inth/sdk/ui/primitives';
import buttonStyles from '@inth/sdk/ui/styles/components/button';
import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';
import type { ClassNameStyle } from '@inth/sdk/ui/theme';
import {
	findFocusRestoreEquivalent,
	getTextDirection,
	resolveStyles,
	toStyleAttributeValue,
} from '@inth/sdk/ui/utils';

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

/**
 * The opt-out confirmation view body, loaded lazily by `<inth-opt-out-confirmation>`
 * and `<inth-consent-dialog>`.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [FocusTrap, InitialFocus, Portal, ScrollLock],
	providers: [NoStyleScope],
	selector: 'inth-opt-out-confirmation-panel',
	template: `@if (isOpen()) {
		<div
			inthPortal
			style="display: contents;"
		>
			<div
				aria-hidden="true"
				role="presentation"
				data-state="open"
				[class]="overlayStyle().className || ''"
				[attr.style]="styleOf(overlayStyle())"
				[attr.data-disable-animation]="disableMotion() ? '' : null"
				data-testid="opt-out-confirmation-overlay"
			></div>
			<div
				[class]="positionerClass()"
				[attr.data-disable-animation]="disableMotion() ? '' : null"
				data-state="open"
				[attr.dir]="textDirection()"
			>
				<div
					[inthFocusTrap]="{ enabled: true, initialFocus: 'first-tabbable' }"
					inthInitialFocus
					[inthScrollLock]="true"
					[class]="contentClass()"
					[attr.style]="styleOf(rootStyle())"
					[attr.dir]="textDirection()"
					[attr.lang]="language()"
					role="dialog"
					aria-modal="true"
					aria-labelledby="opt-out-confirmation-title"
					aria-describedby="opt-out-confirmation-description"
					data-state="open"
					data-testid="opt-out-confirmation-root"
					data-inth-surface="dialog"
					tabindex="-1"
					(keydown)="requestCloseOnEscape($event)"
				>
					<div
						[class]="cardStyle().className || ''"
						[attr.style]="styleOf(cardStyle())"
						data-testid="opt-out-confirmation-card"
						tabindex="-1"
					>
						<div
							[class]="headerStyle().className || ''"
							[attr.style]="styleOf(headerStyle())"
							data-testid="opt-out-confirmation-header"
						>
							<h2
								[class]="titleStyle().className || ''"
								[attr.style]="styleOf(titleStyle())"
								data-testid="opt-out-confirmation-title"
								id="opt-out-confirmation-title"
							>
								{{ optOutLink().label }}
							</h2>
						</div>
						<p
							[class]="statusStyle().className || ''"
							[attr.style]="styleOf(statusStyle())"
							data-testid="opt-out-confirmation-status"
							role="status"
						>
							{{ statusText() }}
						</p>
						<p
							[class]="descriptionStyle().className || ''"
							[attr.style]="styleOf(descriptionStyle())"
							data-testid="opt-out-confirmation-description"
							id="opt-out-confirmation-description"
						>
							{{ receiptSentence() }}
						</p>
						@if (hasReceiptDetails()) {
							<dl
								[class]="resolvedNoStyle() ? '' : styles.receipt || ''"
								data-testid="opt-out-confirmation-receipt"
							>
								@if (recordedAt(); as recorded) {
									<div
										[class]="resolvedNoStyle() ? '' : styles.receiptRow || ''"
									>
										<dt
											[class]="
												resolvedNoStyle() ? '' : styles.receiptLabel || ''
											"
										>
											{{ optOutCopy().recordedLabel }}
										</dt>
										<dd
											[class]="
												resolvedNoStyle() ? '' : styles.receiptValue || ''
											"
										>
											<time
												[attr.datetime]="recorded.iso"
												data-testid="opt-out-confirmation-recorded-at"
											>
												{{ recorded.formatted }}
											</time>
										</dd>
									</div>
								}
								@if (receipt().reference; as reference) {
									<div
										[class]="resolvedNoStyle() ? '' : styles.receiptRow || ''"
									>
										<dt
											[class]="
												resolvedNoStyle() ? '' : styles.receiptLabel || ''
											"
										>
											{{ optOutCopy().referenceLabel }}
										</dt>
										<dd
											[class]="
												resolvedNoStyle() ? '' : styles.receiptValue || ''
											"
										>
											<code
												[class]="
													resolvedNoStyle() ? '' : styles.reference || ''
												"
												data-testid="opt-out-confirmation-reference"
											>
												{{ reference }}
											</code>
										</dd>
									</div>
								}
							</dl>
						}
						<div
							[class]="footerStyle().className || ''"
							[attr.style]="styleOf(footerStyle())"
							data-testid="opt-out-confirmation-footer"
						>
							<button
								type="button"
								[class]="doneButtonStyle().className || ''"
								[attr.style]="styleOf(doneButtonStyle())"
								[attr.data-mode]="resolvedNoStyle() ? null : 'filled'"
								[attr.data-size]="resolvedNoStyle() ? null : 'small'"
								[attr.data-variant]="resolvedNoStyle() ? null : 'primary'"
								data-testid="opt-out-confirmation-done-button"
								(click)="close()"
							>
								{{ optOutCopy().done }}
							</button>
							<a
								href="#inth-preferences"
								[class]="preferencesLinkStyle().className || ''"
								[attr.style]="styleOf(preferencesLinkStyle())"
								data-testid="opt-out-confirmation-preferences-link"
								(click)="openPreferences($event)"
							>
								{{ controls().preferences }}
							</a>
						</div>
					</div>
				</div>
			</div>
		</div>
	}`,
})
export class OptOutConfirmationPanel {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);

	readonly open = input<boolean | undefined>(undefined);
	readonly openChange = output<boolean>();
	readonly noStyle = input<boolean | undefined>(undefined);
	readonly disableAnimation = input<boolean | undefined>(undefined);
	readonly rootClass = input<string | undefined>(undefined);
	/** @internal */
	readonly embedded = input(false);

	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly disableMotion = computed(
		() => this.disableAnimation() ?? this.#theme.disableAnimation()
	);
	/** @internal */
	protected readonly controlled = computed(() => this.open() !== undefined);
	/** @internal */
	protected readonly isOpen = computed(() => {
		const explicit = this.open();
		if (explicit !== undefined) {
			return explicit;
		}
		if (this.embedded() && this.#consent.ɵhasStandaloneOptOutConfirmation()) {
			return false;
		}
		return (
			this.#consent.optOutConfirmationOpen() &&
			this.#consent.activeUI() !== 'dialog' &&
			this.#consent.model() !== 'iab' &&
			this.#consent.optOutState().honored
		);
	});

	/** @internal */
	protected readonly styles = styles;
	/** @internal */
	protected readonly receipt = this.#consent.optOutState;
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
	protected readonly receiptSentence = computed(() =>
		resolveOptOutReceiptSentence(this.#consent.copy(), this.receipt())
	);
	/** @internal */
	protected readonly hasReceiptDetails = computed(() => {
		const receipt = this.receipt();
		return receipt.at !== null || receipt.reference !== null;
	});
	/** @internal */
	protected readonly recordedAt = computed(() => {
		const { at } = this.receipt();
		if (at === null) {
			return null;
		}
		return {
			formatted: formatRecordedAt(at, this.language()),
			iso: new Date(at).toISOString(),
		};
	});
	/** @internal */
	protected readonly optOutLink = computed(() =>
		resolveOptOutLink(
			this.#consent.copy(),
			this.#consent.presentation()?.optOutLink
		)
	);
	/** @internal */
	protected readonly controls = computed(() =>
		resolvePreferenceControlLabels(this.#consent.copy())
	);
	/** @internal */
	protected readonly statusText = computed(() =>
		this.#consent.optOutState().via === 'signal'
			? this.optOutCopy().statusSignal
			: this.optOutCopy().statusRequest
	);

	/** @internal */
	protected readonly rootStyle = computed(() => {
		const noStyle = this.resolvedNoStyle();
		return resolveStyles(
			'optOutConfirmation',
			this.#theme.theme(),
			{ className: this.rootClass(), noStyle },
			noStyle
		);
	});
	/** @internal */
	protected readonly cardStyle = computed(() =>
		this.#slot('optOutConfirmationCard', styles.card)
	);
	/** @internal */
	protected readonly headerStyle = computed(() =>
		this.#slot('optOutConfirmationHeader', styles.header)
	);
	/** @internal */
	protected readonly titleStyle = computed(() =>
		this.#slot('optOutConfirmationTitle', styles.title)
	);
	/** @internal */
	protected readonly statusStyle = computed(() =>
		this.#slot('optOutConfirmationStatus', styles.status)
	);
	/** @internal */
	protected readonly descriptionStyle = computed(() =>
		this.#slot('optOutConfirmationDescription', styles.description)
	);
	/** @internal */
	protected readonly footerStyle = computed(() =>
		this.#slot('optOutConfirmationFooter', styles.footer)
	);
	/** @internal */
	protected readonly doneButtonStyle = computed(() => {
		const noStyle = this.resolvedNoStyle();
		const primary = resolveStyles(
			'buttonPrimary',
			this.#theme.theme(),
			{ baseClassName: buttonStyles.button, noStyle },
			noStyle
		);
		return resolveStyles(
			'optOutConfirmationDoneButton',
			this.#theme.theme(),
			{
				baseClassName: primary.className,
				noStyle,
				style: primary.style,
			},
			noStyle
		);
	});
	/** @internal */
	protected readonly preferencesLinkStyle = computed(() =>
		this.#slot('optOutConfirmationPreferencesLink', styles.preferencesLink)
	);
	/** @internal */
	protected readonly overlayStyle = computed(() =>
		this.#slot('optOutConfirmationOverlay', styles.overlay)
	);

	/** @internal */
	protected readonly positionerClass = computed(() => {
		if (this.resolvedNoStyle()) {
			return '';
		}
		let motion = '';
		if (!this.disableMotion()) {
			motion = this.isOpen()
				? styles.dialogVisible || ''
				: styles.dialogHidden || '';
		}
		return `${styles.root || ''} ${motion}`;
	});
	/** @internal */
	protected readonly contentClass = computed(() => {
		const own = this.rootStyle().className || '';
		if (this.resolvedNoStyle()) {
			return own;
		}
		let motion = '';
		if (!this.disableMotion()) {
			motion = this.isOpen()
				? styles.contentVisible || ''
				: styles.contentHidden || '';
		}
		return `${styles.container || ''} ${own} ${motion}`;
	});

	#opener: HTMLElement | null = null;
	#restoreTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		effect(() => {
			this.#styles.ensure(
				WIDGET_SHEETS,
				this.resolvedNoStyle(),
				SURFACE_SCOPES.dialog
			);
		});

		effect((onCleanup) => {
			if (!this.isOpen()) {
				return;
			}
			onCleanup(
				onDialogDismiss(document.documentElement, () => {
					this.close();
				})
			);
		});

		effect(() => {
			const open = this.isOpen();
			const kernel = untracked(this.#consent.kernel);
			if (open) {
				const captured = takeOptOutConfirmationOpener(kernel);
				if (captured) {
					this.#opener = captured;
				} else if (!this.#opener) {
					const active = document.activeElement;
					if (
						active instanceof HTMLElement &&
						active !== document.body &&
						active !== document.documentElement
					) {
						this.#opener = active;
					}
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
				if (
					focusLost &&
					!isOptOutConfirmationOpen(kernel) &&
					kernel.getSnapshot().activeUI !== 'dialog'
				) {
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
	protected close(): void {
		closeOptOutConfirmation(untracked(this.#consent.kernel));
		if (this.controlled()) {
			this.openChange.emit(false);
		}
	}

	/** @internal */
	protected openPreferences(event: MouseEvent): void {
		event.preventDefault();
		this.#consent.setActiveUI('dialog');
	}

	/** @internal */
	protected requestCloseOnEscape(event: KeyboardEvent): void {
		if (isDialogDismissKey(event.key) && !event.defaultPrevented) {
			event.preventDefault();
			this.close();
		}
	}

	#slot(
		key: Parameters<typeof resolveStyles>[0],
		baseClassName: string | undefined
	): ClassNameStyle {
		const noStyle = this.resolvedNoStyle();
		return resolveStyles(
			key,
			this.#theme.theme(),
			{ baseClassName, noStyle },
			noStyle
		);
	}
}
