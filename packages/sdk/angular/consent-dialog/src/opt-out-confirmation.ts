import { isPlatformBrowser } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
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
import { ConsentManager } from '@inth/angular';
import { claimOptOutConfirmationHost } from '@inth/sdk/surface-actions';

import type { OptOutConfirmationPanel } from './opt-out-confirmation-panel';

/**
 * Loads the opt-out confirmation panel body, a chunk of its own.
 *
 * @internal
 */
export const OPT_OUT_CONFIRMATION_PANEL = new InjectionToken<
	() => Promise<Type<OptOutConfirmationPanel>>
>('INTH_OPT_OUT_CONFIRMATION_PANEL', {
	factory: () => async () =>
		(await import('./opt-out-confirmation-panel')).OptOutConfirmationPanel,
});

/**
 * Focused confirmation view shown after a visitor activates an opt-out link
 * under an opt-out policy. Loads its body lazily on first open.
 *
 * @example
 * ```html
 * <inth-consent-banner />
 * <inth-opt-out-confirmation />
 * ```
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { ngSkipHydration: 'true' },
	selector: 'inth-opt-out-confirmation',
	template: '<ng-container #body />',
})
export class OptOutConfirmation {
	readonly #consent = inject(ConsentManager);
	readonly #loadPanel = inject(OPT_OUT_CONFIRMATION_PANEL);
	readonly #pendingTasks = inject(PendingTasks);

	readonly open = input<boolean | undefined>(undefined);
	readonly openChange = output<boolean>();
	readonly noStyle = input<boolean | undefined>(undefined);
	readonly disableAnimation = input<boolean | undefined>(undefined);
	readonly rootClass = input<string | undefined>(undefined);
	/** @internal */
	readonly embedded = input(false);

	private readonly body = viewChild('body', { read: ViewContainerRef });
	readonly #panelType = signal<Type<OptOutConfirmationPanel> | null>(null);
	#loading = false;
	#panel: ComponentRef<OptOutConfirmationPanel> | undefined;

	readonly #needed = computed(
		() =>
			this.open() === true ||
			(this.#consent.optOutConfirmationOpen() &&
				(!this.embedded() || !this.#consent.ɵhasStandaloneOptOutConfirmation()))
	);

	async #load(): Promise<void> {
		if (this.#loading || untracked(this.#panelType)) {
			return;
		}
		this.#loading = true;
		const done = this.#pendingTasks.add();
		try {
			const type = await this.#loadPanel();
			this.#panelType.set(type);
			this.#attach(type);
		} catch {
			// Next open retries.
		} finally {
			this.#loading = false;
			done();
		}
	}

	#attach(type: Type<OptOutConfirmationPanel>): void {
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
				inputBinding('rootClass', this.rootClass),
				inputBinding('embedded', this.embedded),
			],
		});
	}

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		effect((onCleanup) => {
			if (this.embedded()) {
				return;
			}
			const kernel = this.#consent.kernel();
			onCleanup(
				claimOptOutConfirmationHost(kernel, Symbol('OptOutConfirmation'))
			);
		});
		effect(() => {
			if (this.#needed()) {
				untracked(() => {
					void this.#load();
				});
			}
		});
		effect(() => {
			const type = this.#panelType();
			if (type && this.body()) {
				untracked(() => this.#attach(type));
			}
		});
	}
}
