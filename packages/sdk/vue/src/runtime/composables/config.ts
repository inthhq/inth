import { applyExperimentTheme } from '@inth/sdk/engine';
import { defaultConsentConfig } from '@inth/sdk/schema/config';
import { applyThemeSlots } from '@inth/sdk/ui/utils';
import {
	prefersReducedMotion,
	subscribeReducedMotion,
} from '@inth/sdk/ui/utils/reduced-motion';
import { defu } from 'defu';
import {
	computed,
	getCurrentInstance,
	inject,
	onMounted,
	ref,
	toValue,
} from 'vue';
import type { ComputedRef } from 'vue';

import type { ConsentConfig } from '../config';
import {
	consentConfigKey,
	symbolKernelContext,
	symbolSnapshot,
} from '../utils/consent-symbols.model';

export { consentConfigKey } from '../utils/consent-symbols.model';

// One page-wide listener. The value stays `false` until a component
// mounts, so hydration renders what the server rendered.
const reducedMotion = ref(false);
let watchingReducedMotion = false;
const watchReducedMotion = function watchReducedMotion(): void {
	if (watchingReducedMotion) {
		return;
	}
	watchingReducedMotion = true;
	reducedMotion.value = prefersReducedMotion();
	subscribeReducedMotion((reduced) => {
		reducedMotion.value = reduced;
	});
};

export const useConsentConfig =
	function useConsentConfig(): ComputedRef<ConsentConfig> {
		const injected = inject(consentConfigKey);
		// Optional: the config also serves components rendered without a
		// runtime, which then style the parts from the host theme alone.
		const context = inject(symbolKernelContext, undefined);
		const snapshot = inject(symbolSnapshot, undefined) ?? context?.snapshot;
		// Its own computed, so a snapshot that keeps the assignment does not
		// re-render every component that reads the config.
		const assignment = computed(() => snapshot?.value.experiment);
		if (getCurrentInstance()) {
			onMounted(watchReducedMotion);
		}

		return computed(() => {
			const host = toValue(injected);
			const merged = defu(host, defaultConsentConfig) as ConsentConfig;
			// Unset, `disableAnimation` follows the visitor's reduced motion
			// setting, as in the other adapters.
			const config =
				host?.disableAnimation === undefined && reducedMotion.value
					? { ...merged, disableAnimation: true }
					: merged;
			// The assigned arm's slots merge over the host's, the way
			// `useResolvedTheme` merges its tokens. The definition matches
			// `useExperimentDefinition`, which cannot be called from here.
			const theme = applyExperimentTheme(
				config.theme,
				context?.ownsKernel ? context.experimentDefinition : config.experiment,
				assignment.value
			);
			// `theme.slots` style the same parts as `components`, which win
			// where both set the same attribute.
			const components = applyThemeSlots(
				theme?.slots,
				config.components,
				'class'
			);
			// The returned `theme` carries the arm's overrides too, so the
			// buttons read the arm's `consentActions`.
			return components === config.components && theme === config.theme
				? config
				: { ...config, components, theme };
		});
	};
