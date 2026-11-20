<script lang="ts" setup>
import { computed, inject, onMounted, provide, ref, toValue, watch } from 'vue';

import {
	useConsentActiveUI,
	useConsentInit,
	useConsentKernelContext,
} from '../composables';
import {
	useHasOptOutConfirmationHost,
	useOptOutConfirmationOpen,
} from '../composables/kernel';
import { useMounted } from '../composables/use-mounted';
import { applyRootOverrides } from '../root-overrides';
import { consentConfigKey, symbolConfirmationHosted } from '../utils/symbols';
import {
	ConsentBannerHost as ConsentBanner,
	LazyConsentDialogTrigger,
	LazyConsentManager,
	LazyIabConsentBanner,
	LazyIabConsentDialog,
	LazyOptOutConfirmation,
	prefetchConsentManager,
	prefetchIabConsentDialog,
} from './lazy-surfaces';

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
	if (init.value?.gvl || init.value?.gvlReference) {
		prefetchIabConsentDialog();
	} else {
		prefetchConsentManager();
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
		<LazyOptOutConfirmation
			v-if="
				!(init?.gvl || init?.gvlReference) &&
				confirmationOpen &&
				!hasStandaloneConfirmation
			"
			embedded
		/>
		<LazyConsentDialogTrigger v-if="showTrigger && mounted" />
	</template>
	<slot />
</template>
