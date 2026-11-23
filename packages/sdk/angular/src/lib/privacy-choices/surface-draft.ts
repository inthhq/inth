import {
	computed,
	effect,
	inject,
	Injectable,
	linkedSignal,
	untracked,
} from '@angular/core';
import type { Signal } from '@angular/core';
import { createPreferenceDraft } from '@inth/sdk/preference-draft';
import type {
	PreferenceDraft,
	PreferenceDraftState,
} from '@inth/sdk/preference-draft';

import { ConsentManager } from '../core/consent-manager';

/**
 * A Privacy Choices surface's own preference draft, as React's
 * `ConsentDraftProvider` gives each v6 surface one. The banner's options
 * stage on it until Save, Accept or Reject; the EU dialog stages on it
 * until Save (EU-02); the US dialog applies each switch from it at once.
 *
 * A surface lists it in its `providers`; the parts it renders, including
 * ones created into its view later, inject the same draft. A new kernel,
 * such as the engine's replacing the first render's, starts a new draft,
 * so a save never records into the old runtime.
 *
 * @internal
 */
@Injectable()
export class SurfaceDraft {
	readonly #consent = inject(ConsentManager);

	/** The draft for the current kernel. */
	readonly draft: Signal<PreferenceDraft> = computed(() =>
		createPreferenceDraft(this.#consent.kernel(), {
			defaults: untracked(this.#consent.presentation)?.preferences?.defaults,
		})
	);

	readonly #state = linkedSignal(() => this.draft().getState());

	/** The draft's state, updated on every change. */
	readonly state: Signal<PreferenceDraftState> = this.#state.asReadonly();

	constructor() {
		effect((onCleanup) => {
			const draft = this.draft();
			untracked(() => this.#state.set(draft.getState()));
			onCleanup(
				draft.subscribe(() => {
					this.#state.set(draft.getState());
				})
			);
		});
		effect(() => {
			const defaults = this.#consent.presentation()?.preferences?.defaults;
			const draft = this.draft();
			untracked(() => draft.setDefaults(defaults));
		});
	}
}
