import { resolveConsentPresentation } from '@inth/sdk/engine';
import type {
	PreferencesPresentation,
	PromptPresentation,
} from '@inth/sdk/engine';
import { computed, toValue, watch } from 'vue';
import type { ComputedRef, MaybeRefOrGetter } from 'vue';

import { useConsentConfig } from './config';
import { useResolvedPresentation } from './use-experiment';
import { useConsentSnapshot } from './use-consent-kernel';

/** Resolve the shared policy constraints and application presentation. */
export const useConsentPolicyActions = function useConsentPolicyActions(
	surface: 'prompt' | 'preferences',
	override?: MaybeRefOrGetter<
		PromptPresentation | PreferencesPresentation | undefined
	>
) {
	const snapshot = useConsentSnapshot();
	// Only the rule feeds the presentation. Reading it through its own
	// computed keeps the presentation, and every component using it, from
	// recomputing on kernel changes that leave the rule alone.
	const policyRule = computed(() => snapshot.value.policyRule);
	const hostPresentation = useResolvedPresentation();
	const presentation = computed(() =>
		resolveConsentPresentation({
			override: toValue(override),
			policy: policyRule.value,
			presentation: hostPresentation.value,
			surface,
		})
	);
	watch(
		presentation,
		(value) => {
			for (const diagnostic of value.diagnostics) {
				console.warn(`[inth] ${diagnostic.code}: ${diagnostic.message}`);
			}
		},
		{ immediate: true }
	);
	return {
		actionGroups: computed(() => presentation.value.actionGroups),
		/** Backdrop, scroll lock, focus trap and no outside dismissal as one value. */
		blocking: computed(() => presentation.value.blocking),
		direction: computed(() => presentation.value.direction),
		/** Additional preferences buttons recommended for the stock UI. */
		preferenceControls: computed(() => presentation.value.preferenceControls),
		presentation,
		primaryActions: computed(() => presentation.value.primaryActions),
		shouldFillActions: computed(() => presentation.value.shouldFillActions),
	};
};

/**
 * The blocking the IAB banner and dialog take from the config's
 * `trapFocus`. The banner passes it on as `blockUntilChoice`, the dialog as
 * `blocking`. An explicit `presentation.prompt.blockUntilChoice` or
 * `presentation.preferences.blocking` wins over it, so this is `undefined`
 * then, as it is when `trapFocus` is unset.
 *
 * @internal
 */
export const useFocusBlocking = function useFocusBlocking(
	surface: 'prompt' | 'preferences'
): ComputedRef<boolean | undefined> {
	const config = useConsentConfig();
	const hostPresentation = useResolvedPresentation();
	return computed(() => {
		const explicit =
			surface === 'prompt'
				? hostPresentation.value?.prompt?.blockUntilChoice
				: hostPresentation.value?.preferences?.blocking;
		if (explicit !== undefined) {
			return undefined;
		}
		return config.value.trapFocus;
	});
};
