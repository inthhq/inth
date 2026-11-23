import {
	applyExperimentAssignment,
	resolveConsentDesign,
} from '@inth/sdk/surface-state';
import { computed, inject, toValue } from 'vue';
import type { ComputedRef } from 'vue';

import {
	consentConfigKey,
	symbolKernelContext,
	symbolSnapshot,
} from '../../utils/symbols';

/**
 * Whether the stock surfaces render the Privacy Choices design. Read from
 * the raw config, so a root that only mounts surfaces does not bring the
 * theme merge into its chunk; the assigned experiment arm's presentation
 * applies as it does for the banner.
 *
 * @internal
 */
export const usePrivacyChoicesDesign =
	function usePrivacyChoicesDesign(): ComputedRef<boolean> {
		const configSource = inject(consentConfigKey, undefined);
		const context = inject(symbolKernelContext, undefined);
		const snapshot = inject(symbolSnapshot, undefined) ?? context?.snapshot;
		return computed(() => {
			const config = toValue(configSource);
			const current = snapshot?.value;
			if (!current) {
				return false;
			}
			const presentation = applyExperimentAssignment(
				config?.presentation,
				context?.ownsKernel ? context.experimentDefinition : config?.experiment,
				current.experiment
			);
			return resolveConsentDesign(presentation) === 'privacy-choices';
		});
	};
