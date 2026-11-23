<script lang="ts" setup>
import { computed, inject, onMounted, provide, ref, toValue, watch } from 'vue';

import { applyRootOverrides } from '../apply-root-overrides';
import {
	useConsentActiveUI,
	useConsentInit,
	useConsentKernelContext,
} from '../composables';
import {
	useConsentKernel,
	useHasOptOutConfirmationHost,
	useOptOutConfirmationOpen,
} from '../composables/use-consent-kernel';
import { useMounted } from '../composables/use-mounted';
import {
	consentConfigKey,
	symbolConfirmationHosted,
} from '../utils/consent-symbols.model';
import { ConsentBannerHost as ConsentBanner } from './consent-banner-host';
import { LazyConsentDialogTrigger } from './lazy-consent-dialog-trigger';
import { LazyConsentManager } from './lazy-consent-manager';
import { LazyIabConsentBanner } from './lazy-iab-consent-banner';
import { LazyIabConsentDialog } from './lazy-iab-consent-dialog';
import { prefetchIabConsentDialog } from './prefetch-iab-consent-dialog';
import { useAdoptOptOutConfirmation } from './parts/use-adopt-opt-out-confirmation';

// The default slot renders after the surfaces, so a root that wraps the
// app the way a React provider does keeps the app.
const props = defineProps<{
	region?: string;
	country?: string;
	language?: string;
}>();

// The root reads one option. `useConsentConfig()` also resolves the theme
// and experiment, code the first load can do without (`showTrigger`
// defaults to `false`).
const configSource = inject(consentConfigKey, undefined);
const showTrigger = computed(() => Boolean(toValue(configSource)?.showTrigger));
const init = useConsentInit();
const activeUI = useConsentActiveUI();
const context = useConsentKernelContext();
const confirmationOpen = useOptOutConfirmationOpen();
const hasStandaloneConfirmation = useHasOptOutConfirmationHost();
provide(symbolConfirmationHosted, true);
// An `iab` policy without `iab` has no surface to show; the context reports
// the error instead.
const { iabUnavailable } = context;
// The trigger shows only after mount, so its chunk loads after mount too.
const mounted = useMounted();
// The dialog confirms an opt-out on its receipt, unless a standalone
// `OptOutConfirmation` shows it.
useAdoptOptOutConfirmation(
	useConsentKernel(),
	() =>
		!(init.value?.gvl || init.value?.gvlReference) &&
		confirmationOpen.value &&
		!hasStandaloneConfirmation.value
);

watch(
	() => ({
		country: props.country,
		language: props.language,
		region: props.region,
	}),
	(next, previous) => applyRootOverrides(context, next, previous),
	{ immediate: true }
);

// Mount dialog surfaces once first needed, then keep them mounted (close
// animations, repeat opens). Chunks are prefetched on idle so the first
// open never pays network+parse.
const managerNeeded = ref(false);
const iabDialogNeeded = ref(false);
watch(
	activeUI,
	(ui) => {
		if (ui === 'manager') {
			if (init.value?.gvl || init.value?.gvlReference) {
				iabDialogNeeded.value = true;
			} else {
				managerNeeded.value = true;
			}
		}
	},
	{ immediate: true }
);
onMounted(() => {
	// The consent dialog warms on intent, from the banner.
	if (init.value?.gvl || init.value?.gvlReference) {
		prefetchIabConsentDialog();
	}
});
</script>

<template>
	<template v-if="!iabUnavailable">
		<LazyIabConsentBanner v-if="init?.gvl || init?.gvlReference" />
		<ConsentBanner v-else />
		<LazyIabConsentDialog
			v-if="(init?.gvl || init?.gvlReference) && iabDialogNeeded"
		/>
		<LazyConsentManager
			v-else-if="!(init?.gvl || init?.gvlReference) && managerNeeded"
		/>
		<LazyConsentDialogTrigger v-if="showTrigger && mounted" />
	</template>
	<slot />
</template>
