<script lang="ts" setup>
import { onMounted, provide, ref, watch } from 'vue';

import { applyRootOverrides } from '../apply-root-overrides';
import {
	useConsentActiveUI,
	useConsentInit,
	useConsentKernelContext,
} from '../composables';
import { useConsentConfig } from '../composables/config';
import {
	useConsentKernel,
	useHasOptOutConfirmationHost,
	useOptOutConfirmationOpen,
} from '../composables/use-consent-kernel';
import { useMounted } from '../composables/use-mounted';
import { symbolConfirmationHosted } from '../utils/consent-symbols.model';
import {
	LazyConsentDialogTrigger,
	LazyConsentManager,
	LazyIabConsentBanner,
	LazyIabConsentDialog,
	OptInConfirmationHost,
	prefetchIabConsentDialog,
} from './lazy-surfaces';
import { useAdoptOptOutConfirmation } from './parts/receipt-focus';
import ConsentBanner from './prompt/prompt.vue';

// The default slot renders after the surfaces, so a root that wraps the
// app the way a React provider does keeps the app.
const props = defineProps<{
	region?: string;
	country?: string;
	language?: string;
}>();

const activeUI = useConsentActiveUI();
const init = useConsentInit();
const config = useConsentConfig();
const context = useConsentKernelContext();
const confirmationOpen = useOptOutConfirmationOpen();
const hasStandaloneConfirmation = useHasOptOutConfirmationHost();
provide(symbolConfirmationHosted, true);
// An `iab` policy without `iab` has no surface to show; the context reports
// the error instead.
const { iabUnavailable } = context;
// The trigger shows only after mount, so its chunk loads after mount too.
const mounted = useMounted();
const isIab = () => Boolean(init.value?.gvl || init.value?.gvlReference);
// The dialog confirms an opt-out on its receipt, unless a standalone
// `OptOutConfirmation` shows it.
useAdoptOptOutConfirmation(
	useConsentKernel(),
	() => !isIab() && confirmationOpen.value && !hasStandaloneConfirmation.value
);
// The banner stays mounted once shown, so its exit, the page announcement
// and the focus return outlive the prompt (BNR-06).
const bannerShown = ref(activeUI.value === 'banner');
watch(activeUI, (ui) => {
	if (ui === 'banner') {
		bannerShown.value = true;
	}
});

onMounted(() => {
	// Warm the IAB dialog chunk during idle so the first open is instant.
	// The consent dialog warms on intent, from the banner.
	if (isIab()) {
		prefetchIabConsentDialog();
	}
});

watch(
	() => ({
		country: props.country,
		language: props.language,
		region: props.region,
	}),
	(next, previous) => applyRootOverrides(context, next, previous),
	{ immediate: true }
);
</script>

<template>
	<template v-if="!iabUnavailable">
		<LazyIabConsentBanner
			v-if="(init?.gvl || init?.gvlReference) && activeUI === 'banner'"
		/>
		<LazyIabConsentDialog
			v-else-if="(init?.gvl || init?.gvlReference) && activeUI === 'manager'"
		/>
		<template v-else-if="!(init?.gvl || init?.gvlReference)">
			<ConsentBanner v-if="activeUI === 'banner' || bannerShown" />
			<LazyConsentManager v-if="activeUI === 'manager'" />
			<!-- The banner and the dialog each host the opt-in confirmation.
			     With neither on the page, the root hosts it. -->
			<OptInConfirmationHost v-else-if="!bannerShown" />
		</template>
		<LazyConsentDialogTrigger v-if="config.showTrigger && mounted" />
	</template>
	<slot />
</template>
