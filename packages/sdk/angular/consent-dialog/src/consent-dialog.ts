import { isPlatformBrowser } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	InjectionToken,
	input,
	inputBinding,
	output,
	outputBinding,
	PendingTasks,
	PLATFORM_ID,
	signal,
	untracked,
	viewChild,
	ViewContainerRef,
} from '@angular/core';
import type { ComponentRef, Type } from '@angular/core';
import {
	ConsentManager,
	registerDialogWarmer,
	ɵloadConsentDialogBody as loadConsentDialogBody,
	ɵOptInConfirmation as OptInConfirmation,
	ɵrequestReceiptFocus as requestReceiptFocus,
	ɵreturnFocusAfterDialog as returnFocusAfterDialog,
} from '@inth/angular';
import type { ɵConsentDialogBody as ConsentDialogBody } from '@inth/angular';
import { ConsentDialogTrigger } from '@inth/angular/consent-dialog-trigger';
import type { ActiveUI } from '@inth/sdk/engine';
import { showConsentSurface } from '@inth/sdk/surface-actions';

import { DEFAULT_DIALOG_MODELS } from './consent-dialog-options.model';
import type {
	ConsentDialogLegalLinks,
	ConsentDialogModels,
	ConsentDialogTriggerOptions,
} from './consent-dialog-options.model';
import { OptOutConfirmation } from './opt-out-confirmation';

/**
 * Loads the dialog's body, a chunk of its own with its stylesheets.
 * Provide another to test what a page loads.
 *
 * @internal
 */
export const CONSENT_DIALOG_BODY = new InjectionToken<
	() => Promise<Type<ConsentDialogBody>>
>('INTH_CONSENT_DIALOG_BODY', {
	factory: () => loadConsentDialogBody,
});

/**
 * The "Your Privacy Choices" dialog: the rights on its first view, the
 * receipt and Preferences, or the EU's categories and a staged Save. It
 * opens when `ConsentManager.activeUI()` is `'dialog'`: from a
 * `<inth-privacy-choices-link>`, a `[inthConsentDialogLink]`, or the
 * floating trigger (`showTrigger`). Escape closes it.
 *
 * It confirms an opt-out on its receipt: the opt-out confirmation opens it
 * there, unless a standalone `<inth-opt-out-confirmation>` is mounted or
 * `models` leaves the policy out. A controlled `open` asks the consent
 * manager to show it once each time it turns `true`.
 *
 * The dialog's body is a chunk of its own. It loads when the dialog
 * opens, or earlier: in idle time after the page loads while a button that
 * opens it is mounted, and on hover or focus of that button (the
 * provider's `preloadDialog`). A load that fails is tried again the next
 * time the dialog opens; one that fails while it opens puts back the
 * surface it replaced.
 *
 * @example
 * ```html
 * <inth-consent-banner />
 * <inth-consent-dialog [legalLinks]="['privacyPolicy']" />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	// The server renders nothing here, and the body is created in the
	// browser: there is nothing to hydrate.
	host: { ngSkipHydration: 'true' },
	imports: [ConsentDialogTrigger, OptInConfirmation, OptOutConfirmation],
	selector: 'inth-consent-dialog',
	// The dialog confirms an opt-out on its receipt, so the embedded
	// confirmation shows only when this dialog cannot show: it does not
	// open under the policy's model, or a controlled \`open\` is false.
	template: `@if (!canShow()) {
			<inth-opt-out-confirmation
				[embedded]="true"
				[noStyle]="noStyle()"
				[disableAnimation]="disableAnimation()"
			/>
		}
		<inth-opt-in-confirmation
			[noStyle]="noStyle()"
			[disableAnimation]="disableAnimation()"
		/>
		@if (triggerOptions(); as trigger) {
			@defer (on immediate) {
				<inth-consent-dialog-trigger
					[defaultPosition]="trigger.defaultPosition ?? 'bottom-right'"
					[persistPosition]="trigger.persistPosition ?? true"
					[showWhen]="trigger.showWhen ?? 'always'"
					[size]="trigger.size ?? 'md'"
					[label]="trigger.label"
					[noStyle]="trigger.noStyle ?? noStyle()"
					[rootClass]="trigger.rootClass"
					(triggerClick)="openFromTrigger($event)"
				/>
			}
		}
		<ng-container #body />`,
})
export class ConsentDialog {
	readonly #consent = inject(ConsentManager);

	/**
	 * Control the open state. `true` asks the consent manager to show the
	 * dialog; Close, Done, Escape and a choice then close it through the
	 * consent manager and emit `openChange(false)`, and `open` must turn
	 * `false` and back to `true` to ask again. `false` hides it whatever the
	 * consent manager shows. Unset, it follows `ConsentManager.activeUI()`.
	 */
	readonly open = input<boolean | undefined>(undefined);
	/**
	 * Emits `false` when a controlled dialog closes, and `true` when its
	 * floating trigger asks to open it while `open` is `false`. `[(open)]`
	 * binds it.
	 */
	readonly openChange = output<boolean>();
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/**
	 * Skip the enter and exit animations. Defaults to the provider's
	 * `disableAnimation`, which follows `prefers-reduced-motion`.
	 */
	readonly disableAnimation = input<boolean | undefined>(undefined);
	/** Which of the provider's legal links the dialog shows. */
	readonly legalLinks = input<ConsentDialogLegalLinks | undefined>(undefined);
	/**
	 * Render a `<inth-consent-dialog-trigger>` with the dialog. Pass an
	 * object to set the trigger's inputs.
	 */
	readonly showTrigger = input<boolean | ConsentDialogTriggerOptions>(false);
	/** The policy models the dialog opens for. */
	readonly models = input<ConsentDialogModels>(DEFAULT_DIALOG_MODELS);

	/**
	 * Whether the policy is one this dialog renders for. Under another, such
	 * as IAB beside an IAB dialog, an open preference dialog is not this one.
	 *
	 * @internal
	 */
	protected readonly applies = computed(() =>
		this.models().includes(this.#consent.model())
	);

	/**
	 * Whether the dialog can render now: it applies to the policy's model,
	 * and a controlled `open` of `false` does not keep it hidden. Only then
	 * can the dialog take the opt-out confirmation over.
	 *
	 * @internal
	 */
	protected readonly canShow = computed(
		() => this.applies() && this.open() !== false
	);

	/** Whether this dialog is opening, by its parent or the consent state. */
	readonly #opening = computed(
		() =>
			this.applies() && (this.open() ?? this.#consent.activeUI() === 'dialog')
	);

	/** The floating trigger's inputs, or `null` for none. @internal */
	protected readonly triggerOptions = computed(
		(): ConsentDialogTriggerOptions | null => {
			const trigger = this.showTrigger();
			if (trigger === true) {
				return {};
			}
			return trigger === false ? null : trigger;
		}
	);

	// The surface the dialog replaced when it opened, for a failed load.
	#surfaceBeforeDialog: ActiveUI = 'none';

	readonly #loadBody = inject(CONSENT_DIALOG_BODY);
	readonly #pendingTasks = inject(PendingTasks);
	/** @internal */
	private readonly body = viewChild('body', { read: ViewContainerRef });
	readonly #bodyType = signal<Type<ConsentDialogBody> | null>(null);
	#loading = false;
	#dialog: ComponentRef<ConsentDialogBody> | undefined;

	/**
	 * Loads the body once. A failed load is not kept: the next open, or the
	 * next warm-up, loads it again. The body loads on open, never with the
	 * banner (PERM-05: the banner leaves at once when it opens).
	 */
	async #load(): Promise<void> {
		if (this.#loading || untracked(this.#bodyType)) {
			return;
		}
		this.#loading = true;
		// As a `@defer` block's load: the app is not stable until it settles.
		const done = this.#pendingTasks.add();
		try {
			const type = await this.#loadBody();
			this.#bodyType.set(type);
			// Render it now, as a `@defer` block renders when its load
			// completes: an effect would wait for the next change detection,
			// and the page would see the dialog open with no body.
			this.#attach(type);
		} catch {
			// Opened while it loaded: the banner or trigger it replaced comes
			// back, so the visitor keeps a consent control and can retry. A
			// parent that owns `open` gets it back as `false`; its next open
			// loads again.
			// Only when this dialog was the one opening: another dialog the
			// consent state opened keeps its place.
			if (untracked(this.#opening)) {
				this.restorePreviousSurface();
				if (untracked(this.open) === true) {
					this.openChange.emit(false);
				}
			}
		} finally {
			this.#loading = false;
			done();
		}
	}

	/**
	 * Creates the body once, bound to this host's inputs. It renders with
	 * the change detection the creation schedules; running it here, outside
	 * the host's own pass, breaks the body's first render.
	 */
	#attach(type: Type<ConsentDialogBody>): void {
		const body = this.body();
		if (!body || this.#dialog) {
			return;
		}
		this.#dialog = body.createComponent(type, {
			bindings: [
				inputBinding('open', this.open),
				outputBinding<boolean>('openChange', (open) =>
					this.openChange.emit(open)
				),
				inputBinding('noStyle', this.noStyle),
				inputBinding('disableAnimation', this.disableAnimation),
				inputBinding('legalLinks', this.legalLinks),
				inputBinding('models', this.models),
			],
		});
	}

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		const destroyRef = inject(DestroyRef);

		destroyRef.onDestroy(
			registerDialogWarmer(() => {
				// A warm-up for a dialog of another policy, such as the IAB
				// one, loads nothing here.
				if (!untracked(this.applies)) {
					return;
				}
				// Every warm-up, not only the first: a preload that failed is
				// tried again. An attempt in flight is shared.
				void this.#load();
			})
		);
		effect(() => {
			if (this.#opening()) {
				untracked(() => {
					void this.#load();
				});
			}
		});
		// A body that loaded before this host's view existed renders with it.
		effect(() => {
			const type = this.#bodyType();
			if (type && this.body()) {
				untracked(() => this.#attach(type));
			}
		});

		// The dialog confirms an opt-out on its receipt: the opt-out
		// confirmation (after a revocation reload, or from a one-click
		// opt-out link) opens the dialog there instead. A standalone
		// `<inth-opt-out-confirmation>` the host mounted still shows it
		// itself.
		effect(() => {
			if (
				!(
					this.canShow() &&
					this.#consent.optOutConfirmationOpen() &&
					!this.#consent.ɵhasStandaloneOptOutConfirmation()
				)
			) {
				return;
			}
			untracked(() => {
				const kernel = this.#consent.kernel();
				requestReceiptFocus(kernel);
				// Opening the dialog closes the confirmation.
				showConsentSurface(kernel, 'dialog');
			});
		});
		// Focus returns to the control that opened the dialog when it closes.
		returnFocusAfterDialog(this.open, (previous) => {
			this.#surfaceBeforeDialog = previous;
		});
	}

	/**
	 * A click on the floating trigger. A parent holding `open` at `false`
	 * opens the dialog itself; otherwise the trigger asks the consent
	 * manager.
	 *
	 * @internal
	 */
	protected openFromTrigger(event: MouseEvent): void {
		if (this.open() === false) {
			event.preventDefault();
			this.openChange.emit(true);
		}
	}

	/**
	 * The banner and the trigger hide while the dialog is open, so a dialog
	 * that failed to load would leave no consent UI. Put back the surface it
	 * replaced.
	 *
	 * @internal
	 */
	protected restorePreviousSurface(): void {
		if (
			this.open() === undefined &&
			untracked(this.#consent.activeUI) === 'dialog'
		) {
			this.#consent.setActiveUI(this.#surfaceBeforeDialog);
		}
	}
}
