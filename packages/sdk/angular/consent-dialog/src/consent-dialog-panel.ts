import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	inject,
	input,
	output,
} from '@angular/core';
import {
	ConsentManager,
	ConsentStyles,
	ConsentTheme,
	Portal,
	SURFACE_SCOPES,
	ɵBranding as Branding,
	ɵInlineLegalLinks as InlineLegalLinks,
	ɵNoStyleScope as NoStyleScope,
	ɵresolvedTranslations as resolvedTranslations,
	ɵresolveNoStyle as resolveNoStyle,
	ɵshouldShowBranding as shouldShowBranding,
	ɵSURFACE_CLOSED as SURFACE_CLOSED,
} from '@inth/angular';
import { ConsentDialogTrigger } from '@inth/angular/consent-dialog-trigger';
import { ConsentWidgetRoot, DIALOG_SHEETS } from '@inth/angular/consent-widget';
import {
	DialogBackdrop,
	DialogContent,
	Dialog,
	DialogPositioner,
} from '@inth/angular/primitives';
import { resolveConsentPresentation } from '@inth/sdk/surface-state';
import { isDialogDismissKey } from '@inth/sdk/ui/primitives';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';
import type { ClassNameStyle } from '@inth/sdk/ui/theme';
import {
	getTextDirection,
	resolveLegalLinkEntries,
	resolveStyles,
	toStyleAttributeValue,
} from '@inth/sdk/ui/utils';

import { DEFAULT_DIALOG_MODELS } from './dialog-options';
import type {
	ConsentDialogLegalLinks,
	ConsentDialogModels,
	ConsentDialogTriggerOptions,
} from './dialog-options';

/**
 * The consent dialog's body, without the deferred loading. The package
 * root's `<inth-consent-dialog>` imports this component on first use; the
 * inputs are the same.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		Branding,
		ConsentDialogTrigger,
		ConsentWidgetRoot,
		DialogBackdrop,
		DialogContent,
		Dialog,
		DialogPositioner,
		InlineLegalLinks,
		Portal,
	],
	// Its parts resolve `noStyle` through this surface.
	providers: [
		NoStyleScope,
		{
			// A save, accept or reject in the widget closed the dialog.
			provide: SURFACE_CLOSED,
			useFactory: () => {
				const panel = inject(ConsentDialogPanel);
				return () => panel.ɵactionClosed();
			},
		},
	],
	selector: 'inth-consent-dialog-panel',
	// The floating trigger is an entry point of its own, loaded only for a
	// dialog that renders it. A parent that owns `open` opens the dialog
	// from it, and it hides while that dialog is open.
	template: `@if (triggerOptions(); as trigger) {
			@if (!(controlled() && open())) {
				@defer (on immediate) {
					<inth-consent-dialog-trigger
						[defaultPosition]="trigger.defaultPosition ?? 'bottom-right'"
						[persistPosition]="trigger.persistPosition ?? true"
						[showWhen]="trigger.showWhen ?? 'always'"
						[size]="trigger.size ?? 'md'"
						[label]="trigger.label ?? 'Open privacy settings'"
						[noStyle]="trigger.noStyle ?? resolvedNoStyle()"
						[rootClass]="trigger.rootClass"
						(triggerClick)="openFromTrigger($event)"
					/>
				}
			}
		}
		<ng-container
			inthDialog
			#dialog="inthDialog"
			[open]="isOpen()"
			(openChange)="closeWhenDismissed($event)"
			[closeOnInteractOutside]="false"
			[closeOnEscape]="!controlled()"
			[trapFocus]="preferences().blocking"
			[preventScroll]="preferences().scrollLock"
			[lazyMount]="true"
			[unmountOnExit]="true"
		>
			@if (dialog.shouldRender()) {
				<div
					inthPortal
					style="display: contents;"
				>
					@if (preferences().blocking) {
						<div
							inthDialogBackdrop
							[class]="overlayStyle().className || ''"
							[attr.style]="styleOf(overlayStyle())"
							[attr.data-disable-animation]="disableMotion() ? '' : null"
							data-testid="consent-dialog-overlay"
						></div>
					}
					<!-- data-disable-animation stops the data-state keyframes the
					     stylesheet runs on the overlay and positioner. -->
					<div
						inthDialogPositioner
						[class]="positionerClass()"
						[attr.data-disable-animation]="disableMotion() ? '' : null"
					>
						<div
							inthDialogContent
							[class]="contentClass()"
							[attr.style]="styleOf(rootStyle())"
							[attr.dir]="textDirection()"
							[attr.data-blocking]="preferences().blocking ? 'true' : null"
							data-testid="consent-dialog-root"
							(keydown)="requestCloseOnEscape($event)"
						>
							<div
								[class]="cardStyle().className || ''"
								[attr.style]="styleOf(cardStyle())"
								data-testid="consent-dialog-card"
								tabindex="-1"
							>
								<div
									[class]="headerStyle().className || ''"
									[attr.style]="styleOf(headerStyle())"
									data-testid="consent-dialog-header"
								>
									<h2
										[class]="titleStyle().className || ''"
										[attr.style]="styleOf(titleStyle())"
										data-testid="consent-dialog-title"
										[id]="dialog.titleId"
									>
										{{ translations().consentManagerDialog.title }}
									</h2>
									<div
										[class]="descriptionStyle().className || ''"
										[attr.style]="styleOf(descriptionStyle())"
										data-context="dialog"
										data-testid="consent-dialog-description"
										[id]="dialog.descriptionId"
									>
										{{ translations().consentManagerDialog.description }}
										@if (hasLegalLinks()) {
											<span
												inth-inline-legal-links
												[links]="legalLinks()"
												[testIdPrefix]="'consent-dialog-legal-link'"
											></span>
										}
									</div>
								</div>

								<div
									[class]="contentStyle().className || ''"
									[attr.style]="styleOf(contentStyle())"
									data-testid="consent-dialog-content"
								>
									<!-- The widget's root, not <inth-consent-widget>: the
									     dialog's stylesheet lays it out as a direct child. -->
									@if (hasConsentUi()) {
										<div
											data-testid="consent-widget-root"
											[hideBranding]="true"
											[noStyle]="resolvedNoStyle()"
										></div>
									}
								</div>
								@if (showBranding()) {
									<a
										inth-branding
										[noStyle]="resolvedNoStyle()"
										surface="dialog"
									></a>
								}
							</div>
						</div>
					</div>
				</div>
			}
		</ng-container>`,
})
export class ConsentDialogPanel {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);

	/**
	 * Open or close the dialog from the parent. Unset, it follows
	 * `ConsentManager.activeUI()`. Set, the parent owns visibility: Escape
	 * still asks the consent manager to close, but the dialog stays until
	 * `open` turns `false`.
	 */
	readonly open = input<boolean | undefined>(undefined);
	/** Emits `false` when the visitor asks a controlled dialog to close. */
	readonly openChange = output<boolean>();
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/**
	 * Skip the enter and exit animations. Defaults to the provider's
	 * `disableAnimation`, which follows `prefers-reduced-motion`.
	 */
	readonly disableAnimation = input<boolean | undefined>(undefined);
	/** Hide the "Secured by c15t" attribution. */
	readonly hideBranding = input(false);
	/** Which of the provider's legal links follow the description. */
	readonly legalLinks = input<ConsentDialogLegalLinks | undefined>(undefined);
	/**
	 * Render a `<inth-consent-dialog-trigger>` with the dialog. Pass an
	 * object to set the trigger's inputs.
	 */
	readonly showTrigger = input<boolean | ConsentDialogTriggerOptions>(false);
	/** The policy models the dialog opens for. */
	readonly models = input<ConsentDialogModels>(DEFAULT_DIALOG_MODELS);
	/** Extra class for the dialog element. */
	readonly rootClass = input<string | undefined>(undefined);

	/** @internal */
	protected readonly translations = resolvedTranslations(this.#consent);
	/** @internal */
	protected readonly hasConsentUi = computed(() =>
		this.#consent.hasConsentUi()
	);
	/** @internal */
	protected readonly textDirection = computed(() =>
		getTextDirection(this.#consent.translationConfig().defaultLanguage)
	);
	/** @internal */
	protected readonly resolvedNoStyle = resolveNoStyle(this.noStyle);
	/** @internal */
	protected readonly disableMotion = computed(
		() => this.disableAnimation() ?? this.#theme.disableAnimation()
	);

	/** @internal */
	protected readonly preferences = computed(() => {
		const presentation = this.#consent.presentation();
		return resolveConsentPresentation({
			policy: this.#consent.snapshot().policyRule,
			presentation: {
				...presentation,
				preferences: {
					scrollLock: this.#theme.scrollLock(),
					trapFocus: this.#theme.trapFocus(),
					...presentation?.preferences,
				},
			},
			surface: 'preferences',
		});
	});

	/** @internal */
	protected readonly controlled = computed(() => this.open() !== undefined);

	/**
	 * A click on the generated trigger. With `open` set, the parent opens
	 * the dialog: the consent state stays where it is.
	 *
	 * @internal
	 */
	protected openFromTrigger(event: MouseEvent): void {
		if (this.controlled()) {
			event.preventDefault();
			this.openChange.emit(true);
		}
	}
	/** @internal */
	protected readonly isOpen = computed(
		() =>
			this.#consent.hasConsentUi() &&
			this.models().includes(this.#consent.model()) &&
			(this.open() ?? this.#consent.activeUI() === 'dialog')
	);

	/** @internal */
	protected readonly triggerOptions = computed(() => {
		const trigger = this.showTrigger();
		if (trigger === true) {
			return {} as ConsentDialogTriggerOptions;
		}
		return trigger === false ? null : trigger;
	});

	/** @internal */
	protected readonly hasLegalLinks = computed(
		() =>
			resolveLegalLinkEntries(this.#consent.legalLinks(), this.legalLinks())
				.length > 0
	);
	/** @internal */
	protected readonly showBranding = computed(() =>
		shouldShowBranding(this.#consent.branding(), this.hideBranding())
	);

	/** @internal */
	protected readonly rootStyle = computed(() => {
		const noStyle = this.resolvedNoStyle();
		return resolveStyles(
			'consentDialog',
			this.#theme.theme(),
			{ className: this.rootClass(), noStyle },
			noStyle
		);
	});
	/** @internal */
	protected readonly cardStyle = computed(() =>
		this.#slot('consentDialogCard', styles.card)
	);
	/** @internal */
	protected readonly headerStyle = computed(() =>
		this.#slot('consentDialogHeader', styles.header)
	);
	/** @internal */
	protected readonly titleStyle = computed(() =>
		this.#slot('consentDialogTitle', styles.title)
	);
	/** @internal */
	protected readonly descriptionStyle = computed(() =>
		this.#slot('consentDialogDescription', styles.description)
	);
	/** @internal */
	protected readonly contentStyle = computed(() =>
		this.#slot('consentDialogContent', styles.content)
	);
	/** @internal */
	protected readonly overlayStyle = computed(() =>
		this.#slot('consentDialogOverlay', styles.overlay)
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

	readonly #styles = inject(ConsentStyles);

	constructor() {
		// The dialog's code loads on demand, so its rules arrive with it,
		// and again when `noStyle` turns off.
		effect(() => {
			this.#styles.ensure(
				DIALOG_SHEETS,
				this.resolvedNoStyle(),
				SURFACE_SCOPES.dialog
			);
		});
	}

	/** @internal */
	protected styleOf(style: ClassNameStyle): string | null {
		return toStyleAttributeValue(style.style) ?? null;
	}

	/**
	 * The dialog asked to close (Escape): close the surface.
	 *
	 * @internal
	 */
	protected closeWhenDismissed(open: boolean): void {
		if (!open) {
			this.#consent.setActiveUI('none');
		}
	}

	/**
	 * With `open` set, Escape is a close request: `openChange` emits
	 * `false`, so `[(open)]` hears it even when the consent state already
	 * left the dialog, and the consent manager closes the surface. The
	 * dialog itself stays until the parent sets `open` to `false`.
	 *
	 * @internal
	 */
	/**
	 * An action in the dialog closed the surface: a parent that owns `open`
	 * hears it, so the next render does not open the dialog again.
	 *
	 * @internal
	 */
	ɵactionClosed(): void {
		if (this.controlled()) {
			this.openChange.emit(false);
		}
	}

	protected requestCloseOnEscape(event: KeyboardEvent): void {
		if (this.controlled() && isDialogDismissKey(event.key)) {
			this.openChange.emit(false);
			this.#consent.setActiveUI('none');
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
