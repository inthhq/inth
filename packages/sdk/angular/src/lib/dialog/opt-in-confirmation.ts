import { isPlatformBrowser } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	effect,
	inject,
	InjectionToken,
	input,
	inputBinding,
	PendingTasks,
	PLATFORM_ID,
	signal,
	untracked,
	viewChild,
	ViewContainerRef,
} from '@angular/core';
import type { ComponentRef, Type } from '@angular/core';
import {
	claimOptInConfirmationHost,
	isActiveOptInConfirmationHost,
	isOptInConfirmationOpen,
	subscribeOptInConfirmation,
} from '@inth/sdk/surface-actions';

import { ConsentManager } from '../core/consent-manager';
import type { OptInConfirmationPanel } from './opt-in-confirmation-panel';

/**
 * Loads the opt-in confirmation panel body in its own chunk.
 *
 * @internal
 */
export const OPT_IN_CONFIRMATION_PANEL = new InjectionToken<
	() => Promise<Type<OptInConfirmationPanel>>
>('INTH_OPT_IN_CONFIRMATION_PANEL', {
	factory: () => async () =>
		(await import('./opt-in-confirmation-panel')).OptInConfirmationPanel,
});

/**
 * Lazy host for the two-step opt-in confirmation dialog.
 *
 * Claims a host slot in the shared confirmation registry so mounted surfaces
 * never render duplicate modals, and loads the panel body only when needed.
 *
 * @internal
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { ngSkipHydration: 'true', style: 'display: contents' },
	selector: 'inth-opt-in-confirmation',
	template: '<ng-container #body />',
})
export class OptInConfirmation {
	readonly #consent = inject(ConsentManager);
	readonly #loadPanel = inject(OPT_IN_CONFIRMATION_PANEL);
	readonly #pendingTasks = inject(PendingTasks);
	readonly #token = Symbol('OptInConfirmation');

	readonly noStyle = input<boolean | undefined>(undefined);
	readonly disableAnimation = input<boolean | undefined>(undefined);
	readonly scrollLock = input<boolean | undefined>(undefined);
	readonly trapFocus = input<boolean | undefined>(undefined);

	private readonly body = viewChild('body', { read: ViewContainerRef });
	readonly #active = signal(false);
	readonly #panelType = signal<Type<OptInConfirmationPanel> | null>(null);
	#loading = false;
	#panel: ComponentRef<OptInConfirmationPanel> | undefined;

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

	#attach(type: Type<OptInConfirmationPanel>): void {
		const body = this.body();
		if (!body || this.#panel) {
			return;
		}
		this.#panel = body.createComponent(type, {
			bindings: [
				inputBinding('active', this.#active),
				inputBinding('noStyle', this.noStyle),
				inputBinding('disableAnimation', this.disableAnimation),
				inputBinding('scrollLock', this.scrollLock),
				inputBinding('trapFocus', this.trapFocus),
			],
		});
	}

	constructor() {
		if (!isPlatformBrowser(inject(PLATFORM_ID))) {
			return;
		}
		effect((onCleanup) => {
			const kernel = this.#consent.kernel();
			const sync = () => {
				this.#active.set(
					isOptInConfirmationOpen(kernel) &&
						isActiveOptInConfirmationHost(kernel, this.#token)
				);
			};
			const unclaim = claimOptInConfirmationHost(kernel, this.#token);
			const unsubscribe = subscribeOptInConfirmation(kernel, sync);
			sync();
			onCleanup(() => {
				unsubscribe();
				unclaim();
			});
		});
		effect(() => {
			if (this.#active()) {
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
