<script setup lang="ts">
/**
 * The stock consent dialog ("Your Privacy Choices"). Its chunk, with its
 * stylesheets, loads when it first opens, never with the banner (PERM-05:
 * the banner leaves at once when it opens). The dialog follows
 * `activeUI` itself once mounted.
 *
 * It hosts the opt-in confirmation while mounted, so a confirmation asked
 * for from the dialog never waits on a banner that is not on the page.
 */
import { inject, ref, watch } from 'vue';

import { useConsentActiveUI } from '../../composables';
import {
	useConsentKernel,
	useHasOptOutConfirmationHost,
	useOptInConfirmationHost,
	useOptOutConfirmationOpen,
} from '../../composables/use-consent-kernel';
import { symbolConfirmationHosted } from '../../utils/consent-symbols.model';
import { defineChunkComponent } from '../parts/define-chunk-component';
import { importComponent } from '../parts/import-component';
import { useAdoptOptOutConfirmation } from '../parts/use-adopt-opt-out-confirmation';
import { loadConsentDialog } from './load-panel';

// Vue reads an absent boolean prop as `false`; `undefined` lets the
// config's `disableAnimation` through.
const props = withDefaults(
	defineProps<{
		/** Skip the enter and exit animations. Defaults to the config's. */
		disableAnimation?: boolean;
	}>(),
	{ disableAnimation: undefined }
);

// A failed chunk loads again on the next snapshot, such as the next open.
const LazyConsentDialog = defineChunkComponent(
	'LazyConsentDialog',
	loadConsentDialog
);
const LazyOptInConfirmation = defineChunkComponent(
	'LazyOptInConfirmation',
	() => importComponent(() => import('../opt-in-confirmation.vue'))
);

const activeUI = useConsentActiveUI();
// Mounted once first opened, then kept, so its exit and the focus return
// outlive the open state.
const needed = ref(activeUI.value === 'manager');
watch(activeUI, (ui) => {
	if (ui === 'manager') {
		needed.value = true;
	}
});
const optInConfirmationActive = useOptInConfirmationHost();
const confirmationHostedByProvider = inject(symbolConfirmationHosted, false);
const confirmationOpen = useOptOutConfirmationOpen();
const hasStandaloneConfirmation = useHasOptOutConfirmationHost();
// Under a root, the root does this; on its own, this dialog opens on the
// receipt to confirm an opt-out, unless a standalone `OptOutConfirmation`
// shows it.
useAdoptOptOutConfirmation(
	useConsentKernel(),
	() =>
		!confirmationHostedByProvider &&
		confirmationOpen.value &&
		!hasStandaloneConfirmation.value
);
</script>

<template>
	<LazyOptInConfirmation
		v-if="optInConfirmationActive"
		:disable-animation="props.disableAnimation"
	/>
	<LazyConsentDialog
		v-if="needed"
		:disable-animation="props.disableAnimation"
	/>
</template>
