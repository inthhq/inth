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
	ɵOptInConfirmation as OptInConfirmation,
	ɵreturnFocusAfterDialog as returnFocusAfterDialog,
} from '@inth/angular';
import type { ActiveUI } from '@inth/sdk/engine';

import type { ConsentDialogPanel } from './consent-dialog-panel';
import { DEFAULT_DIALOG_MODELS } from './dialog-options';
import type {
	ConsentDialogLegalLinks,
	ConsentDialogModels,
	ConsentDialogTriggerOptions,
} from './dialog-options';
import { OptOutConfirmation } from './opt-out-confirmation';

/**
 * Loads the dialog's body, a chunk of its own. Provide another to test a
 * failed load.
 *
 * @internal
 */
export const CONSENT_DIALOG_PANEL = new InjectionToken<
	() => Promise<Type<ConsentDialogPanel>>
>('INTH_CONSENT_DIALOG_PANEL', {
	factory: () => async () =>
		(await import('./consent-dialog-panel')).ConsentDialogPanel,
});

/**
 * The preference dialog: the consent widget in a modal, with a title,
 * description, legal links and attribution. It opens when
 * `ConsentManager.activeUI()` is `'dialog'`: from the banner's Customize
 * button, a `[inthConsentDialogLink]`, or `<inth-consent-dialog-trigger>`.
 * Escape closes it.
 *
 * The dialog's body, with the widget and primitives it renders, is a chunk
 * of its own. It loads when the dialog opens, or earlier: in idle time
 * after the page loads while a button that opens it is mounted, and on
 * hover or focus of that button (the provider's `preloadDialog`). A load
 * that fails is tried again the next time the dialog opens; one that fails
 * while it opens puts back the surface it replaced.
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
	imports: [OptInConfirmation, OptOutConfirmation],
	selector: 'inth-consent-dialog',
	template: `<inth-opt-out-confirmation
			[embedded]="true"
			[noStyle]="noStyle()"
			[disableAnimation]="disableAnimation()"
		/><inth-opt-in-confirmation
			[noStyle]="noStyle()"
			[disableAnimation]="disableAnimation()"
		/><ng-container #body />`,
})
export class ConsentDialog {
	readonly #consent = inject(ConsentManager);

	/**
	 * Open or close the dialog from the parent. Unset, it follows
	 * `ConsentManager.activeUI()`. Set, the parent owns visibility: the
	 * dialog stays until `open` turns `false`. Bind `[(open)]` and Escape
	 * turns it `false`.
	 */
	readonly open = input<boolean | undefined>(undefined);
	/**
	 * Emits `false` when the visitor asks a controlled dialog to close, with
	 * Escape. `[(open)]` binds it.
	 */
	readonly openChange = output<boolean>();
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	/**
	 * Skip the enter and exit animations. Defaults to the provider's
	 * `disableAnimation`, which follows `prefers-reduced-motion`.
	 */
	readonly disableAnimation = input<boolean | undefined>(undefined);
	/** Hide the "Secured by" attribution. */
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

	/** Whether a warm signal asked for the dialog's code. @internal */
	protected readonly warmed = signal(false);

	/**
	 * Whether the policy is one this dialog renders for. Under another, such
	 * as IAB beside an IAB dialog, an open preference dialog is not this one.
	 */
	readonly #applies = computed(() =>
		this.models().includes(this.#consent.model())
	);

	/** Whether this dialog is opening, by its parent or the consent state. */
	readonly #opening = computed(
		() =>
			this.#applies() && (this.open() ?? this.#consent.activeUI() === 'dialog')
	);

	/**
	 * The dialog is needed as soon as it opens, and at once when it renders
	 * its own trigger.
	 *
	 * @internal
	 */
	protected readonly needed = computed(
		() => Boolean(this.showTrigger()) || this.#opening()
	);

	// The surface the dialog replaced when it opened, for a failed load.
	#surfaceBeforeDialog: ActiveUI = 'none';

	readonly #loadPanel = inject(CONSENT_DIALOG_PANEL);
	readonly #pendingTasks = inject(PendingTasks);
	/** @internal */
	private readonly body = viewChild('body', { read: ViewContainerRef });
	readonly #panelType = signal<Type<ConsentDialogPanel> | null>(null);
	#loading = false;
	#panel: ComponentRef<ConsentDialogPanel> | undefined;

	/**
	 * Loads the body once. A failed load is not kept: the next open, or the
	 * next warm-up, loads it again.
	 */
	async #load(): Promise<void> {
		if (this.#loading || untracked(this.#panelType)) {
			return;
		}
		this.#loading = true;
		// As a `@defer` block's load: the app is not stable until it settles.
		const done = this.#pendingTasks.add();
		try {
			const type = await this.#loadPanel();
			this.#panelType.set(type);
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
	#attach(type: Type<ConsentDialogPanel>): void {
		const body = this.body();
		if (!body || this.#panel) {
			return;
		}
		this.#panel = body.createComponent(type, {
			bindings: [
				inputBinding('open', this.open),
				outputBinding<boolean>('openChange', (open) =>
					this.openChange.emit(open)
				),
				inputBinding('noStyle', this.noStyle),
				inputBinding('disableAnimation', this.disableAnimation),
				inputBinding('hideBranding', this.hideBranding),
				inputBinding('legalLinks', this.legalLinks),
				inputBinding('showTrigger', this.showTrigger),
				inputBinding('models', this.models),
				inputBinding('rootClass', this.rootClass),
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
				if (!untracked(this.#applies)) {
					return;
				}
				this.warmed.set(true);
				// Every warm-up, not only the first: a preload that failed is
				// tried again. An attempt in flight is shared.
				void this.#load();
			})
		);
		// The body's preference draft is a chunk the body imports: start it
		// with the body, not after it, so they download side by side.
		effect(() => {
			if (this.needed() || (this.warmed() && this.#applies())) {
				untracked(() => {
					this.#consent.preloadDraft();
					void this.#load();
				});
			}
		});
		// A body that loaded before this host's view existed renders with it.
		effect(() => {
			const type = this.#panelType();
			if (type && this.body()) {
				untracked(() => this.#attach(type));
			}
		});

		// Focus returns to the control that opened the dialog when it closes.
		returnFocusAfterDialog(this.open, (previous) => {
			this.#surfaceBeforeDialog = previous;
		});
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
