<script lang="ts" setup>
import { onMounted, provide, ref, watch } from 'vue';

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
} from '../composables/kernel';
import { useMounted } from '../composables/use-mounted';
import { applyRootOverrides } from '../root-overrides';
import { symbolConfirmationHosted } from '../utils/symbols';
import {
	ConsentDialogHost,
	LazyConsentDialogTrigger,
	LazyIabConsentBanner,
	LazyIabConsentDialog,
	LazyOptOutConfirmation,
	prefetchConsentManager,
	prefetchIabConsentDialog,
	useWarmableDialogDesign,
} from './lazy-surfaces';
import { useAdoptOptOutConfirmation } from './privacy-choices/receipt-focus';
import { usePrivacyChoicesDesign } from './privacy-choices/use-design';
import ConsentBanner from './prompt.vue';

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
// The Privacy Choices banner stays mounted once shown, so its exit, the
// page announcement and the focus return outlive the prompt (BNR-06). The
// classic banner still mounts only while it shows.
const privacyChoices = usePrivacyChoicesDesign();
useWarmableDialogDesign(() =>
	privacyChoices.value ? 'privacy-choices' : 'classic'
);
const isIab = () => Boolean(init.value?.gvl || init.value?.gvlReference);
// The Privacy Choices design confirms an opt-out on its receipt, in the
// dialog, unless a standalone `OptOutConfirmation` shows it.
useAdoptOptOutConfirmation(
	useConsentKernel(),
	() =>
		privacyChoices.value &&
		!isIab() &&
		confirmationOpen.value &&
		!hasStandaloneConfirmation.value
);
const bannerShown = ref(activeUI.value === 'banner');
watch(activeUI, (ui) => {
	if (ui === 'banner') {
		bannerShown.value = true;
	}
});

onMounted(() => {
	// Warm the dialog chunk during idle so the first open is instant.
	if (init.value?.gvl || init.value?.gvlReference) {
		prefetchIabConsentDialog();
	} else {
		prefetchConsentManager();
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
			<ConsentBanner
				v-if="activeUI === 'banner' || (privacyChoices && bannerShown)"
			/>
			<ConsentDialogHost v-if="activeUI === 'manager'" />
		</template>
		<LazyOptOutConfirmation
			v-if="
				!(init?.gvl || init?.gvlReference) &&
				!privacyChoices &&
				confirmationOpen &&
				!hasStandaloneConfirmation
			"
			embedded
		/>
		<LazyConsentDialogTrigger v-if="config.showTrigger && mounted" />
	</template>
	<slot />
</template>
