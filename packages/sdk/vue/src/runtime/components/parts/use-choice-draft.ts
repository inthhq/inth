import { createPreferenceDraft } from '@inth/sdk/preference-draft';
import type {
	PreferenceDraft,
	PreferenceDraftState,
} from '@inth/sdk/preference-draft';
import { inject, onScopeDispose, provide, shallowRef, watch } from 'vue';
import type { InjectionKey, ShallowRef } from 'vue';

import { useConsentKernel } from '../../composables/use-consent-kernel';
import { useResolvedPresentation } from '../../composables/use-experiment';

/** A prompt's or dialog's preference draft and its current state. */
export interface ChoiceDraft {
	draft: PreferenceDraft;
	state: ShallowRef<PreferenceDraftState>;
}

const choiceDraftKey: InjectionKey<ChoiceDraft> = Symbol('inth:choice-draft');

/**
 * Give the prompt or the dialog its own preference draft, shared with the
 * rows below it, so Save records exactly what they show. The dialog's
 * switches stay staged until Save in the EU (EU-02), and apply one by one
 * in the US.
 *
 * @internal
 */
export const provideChoiceDraft = function provideChoiceDraft(): ChoiceDraft {
	const kernel = useConsentKernel();
	const presentation = useResolvedPresentation();
	const draft = createPreferenceDraft(kernel, {
		defaults: presentation.value?.preferences?.defaults,
	});
	const state = shallowRef(draft.getState());
	if (typeof window !== 'undefined') {
		onScopeDispose(
			draft.subscribe(() => {
				state.value = draft.getState();
			})
		);
	}
	watch(
		() => presentation.value?.preferences?.defaults,
		(defaults) => {
			draft.setDefaults(defaults);
			state.value = draft.getState();
		}
	);
	const value = { draft, state };
	provide(choiceDraftKey, value);
	return value;
};

/**
 * The nearest prompt or dialog draft.
 *
 * @throws {Error} Outside a surface that provides one.
 * @internal
 */
export const useChoiceDraft = function useChoiceDraft(): ChoiceDraft {
	const value = inject(choiceDraftKey, null);
	if (!value) {
		throw new Error('[inth] consent draft not found');
	}
	return value;
};
