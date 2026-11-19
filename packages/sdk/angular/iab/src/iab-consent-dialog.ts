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
	ConsentStyles,
	ConsentTheme,
	registerDialogWarmer,
	ɵwhenPageIdle as whenPageIdle,
	SURFACE_SCOPES,
	ɵNoStyleScope as NoStyleScope,
	ɵresolveNoStyle as resolveNoStyle,
	ɵreturnFocusAfterDialog as returnFocusAfterDialog,
} from '@inth/angular';
import type { ActiveUI, Model } from '@inth/sdk/engine';

import type { IABConsentDialogBody } from './iab-consent-dialog-body';
import { IAB_DIALOG_SHEETS } from './iab-dialog-sheets';

/**
 * Loads the IAB dialog's body, a chunk of its own. Provide another to test
 * a failed load.
 *
 * @internal
 */
export const IAB_CONSENT_DIALOG_BODY = new InjectionToken<
	() => Promise<Type<IABConsentDialogBody>>
>('INTH_IAB_CONSENT_DIALOG_BODY', {
	factory: () => async () =>
		(await import('./iab-consent-dialog-body')).IABConsentDialogBody,
});

/** A tab of the IAB preference centre. */
export type IABPreferenceTab = 'purposes' | 'vendors';

/**
 * The IAB TCF 2.4 preference centre: purposes, stacks, special features
 * and features on one tab, the vendor list (IAB vendors, custom vendors and
 * Google ad tech providers) on the other, with Accept all, Reject all and
 * Save.
 *
 * Opens when the IAB banner's Customize or partners link is used, or when
 * `ConsentManager.setActiveUI('dialog')` is called under an `iab` policy.
 * Its body is a chunk of its own. It loads when the dialog first opens, and
 * under a policy it renders for, is prefetched in idle time after the page
 * loads. A load that fails is tried again
 * the next time the dialog opens; one that fails while it opens puts back
 * the surface it replaced.
 *
 * @example
 * ```html
 * <inth-iab-consent-banner />
 * <inth-iab-consent-dialog />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	// The server renders nothing here, and the body is created in the
	// browser: there is nothing to hydrate.
	host: { ngSkipHydration: 'true', style: 'display: contents' },
	// Its parts resolve `noStyle` through this surface.
	providers: [NoStyleScope],
	selector: 'inth-iab-consent-dialog',
	template: '<ng-container #body />',
})
export class IABConsentDialog {
	readonly #consent = inject(ConsentManager);
	readonly #theme = inject(ConsentTheme);
	readonly #styles = inject(ConsentStyles);

	/**
	 * Show the dialog regardless of the active surface. Unset, it follows
	 * `ConsentManager.activeUI()`.
	 */
	readonly open = input<boolean | undefined>(undefined);
	/**
	 * Emits `false` when the visitor asks to close, with Escape or the close
	 * button. `[(open)]` binds it; with a one-way `[open]` the dialog stays
	 * until the parent changes it.
	 */
	readonly openChange = output<boolean>();
	/** Drop the stock classes. Defaults to the provider's `noStyle`. */
	readonly noStyle = input<boolean | undefined>(undefined);
	readonly #noStyle = resolveNoStyle(this.noStyle);
	/**
	 * Skip the backdrop's fade-in. Defaults to the provider's
	 * `disableAnimation`, which follows `prefers-reduced-motion`.
	 */
	readonly disableAnimation = input<boolean | undefined>(undefined);
	/** Hide the "Secured by" attribution. */
	readonly hideBranding = input(false);
	/**
	 * The tab the preference centre opens on. Lets a "N partners" link land
	 * on the vendor list instead of the purposes.
	 */
	readonly initialTab = input<IABPreferenceTab | undefined>(undefined);
	/** The policy models the dialog renders for. */
	readonly models = input<readonly Model[]>(['iab']);
	/** Extra class for the dialog card. */
	readonly rootClass = input<string | undefined>(undefined);

	/** Whether the dialog can show: an IAB policy it renders for. */
	readonly #applies = computed(
		() =>
			this.models().includes(this.#consent.model()) &&
			this.#consent.iab()?.config.enabled === true
	);
	/** Whether the dialog shows. @internal */
	protected readonly isOpen = computed(
		() =>
			this.#consent.hasConsentUi() &&
			this.#applies() &&
			(this.open() ?? this.#consent.activeUI() === 'dialog')
	);
	/** @internal */
	protected readonly resolvedDisableAnimation = computed(
		() => this.disableAnimation() ?? this.#theme.disableAnimation()
	);

	readonly #loadBody = inject(IAB_CONSENT_DIALOG_BODY);
	readonly #pendingTasks = inject(PendingTasks);
	/** @internal */
	private readonly body = viewChild('body', { read: ViewContainerRef });
	readonly #bodyType = signal<Type<IABConsentDialogBody> | null>(null);
	#loading = false;
	#created: ComponentRef<IABConsentDialogBody> | undefined;
	// The surface the dialog replaced when it opened, for a failed load.
	#surfaceBeforeDialog: ActiveUI = 'none';

	/**
	 * Loads the body once. A failed load is not kept: the next open, or the
	 * idle prefetch, loads it again.
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
			// completes, not on the next change detection.
			this.#attach(type);
		} catch {
			// Opened while it loaded: the surface it replaced comes back, so
			// the visitor keeps a consent control and can retry.
			if (
				untracked(this.isOpen) &&
				untracked(this.open) === undefined &&
				untracked(this.#consent.activeUI) === 'dialog'
			) {
				this.#consent.setActiveUI(this.#surfaceBeforeDialog);
			}
			// A parent that owns `open` gets it back as `false`; its next open
			// loads again.
			if (untracked(this.open) === true) {
				this.openChange.emit(false);
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
	#attach(type: Type<IABConsentDialogBody>): void {
		const body = this.body();
		if (!body || this.#created) {
			return;
		}
		this.#created = body.createComponent(type, {
			bindings: [
				inputBinding('open', this.isOpen),
				outputBinding<boolean>('openChange', (open) =>
					this.openChange.emit(open)
				),
				inputBinding('noStyle', this.noStyle),
				inputBinding('disableAnimation', this.resolvedDisableAnimation),
				inputBinding('hideBranding', this.hideBranding),
				inputBinding('initialTab', this.initialTab),
				inputBinding('rootClass', this.rootClass),
			],
		});
	}

	constructor() {
		effect(() => {
			if (this.isOpen()) {
				this.#styles.ensure(
					IAB_DIALOG_SHEETS,
					this.#noStyle(),
					SURFACE_SCOPES.iabDialog
				);
			}
		});
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		// Focus returns to the control that opened the dialog when it
		// closes, blocking or not.
		returnFocusAfterDialog(this.open, (previous) => {
			this.#surfaceBeforeDialog = previous;
		});
		effect(() => {
			if (this.isOpen()) {
				untracked(() => {
					void this.#load();
				});
			}
		});
		// Warm-ups, such as hovering a preferences link, load it too, and
		// try again after a failed prefetch. An attempt in flight is shared.
		// A standard dialog's opener warms every dialog: this one loads only
		// when it can open.
		inject(DestroyRef).onDestroy(
			registerDialogWarmer(() => {
				if (untracked(this.#applies)) {
					void this.#load();
				}
			})
		);
		// Prefetch on the standard dialog's boundary, idle time after the
		// page loads, and only while an IAB policy lets this dialog open.
		effect((onCleanup) => {
			if (
				this.#applies() &&
				(this.#theme.preloadDialog() ?? 'idle') === 'idle'
			) {
				onCleanup(
					whenPageIdle(() => {
						void this.#load();
					})
				);
			}
		});
		// A body that loaded before this host's view existed renders with it.
		effect(() => {
			const type = this.#bodyType();
			if (type && this.body()) {
				untracked(() => this.#attach(type));
			}
		});
	}
}
