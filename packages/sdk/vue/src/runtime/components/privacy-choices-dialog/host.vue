<script setup lang="ts">
/**
 * The Privacy Choices dialog as the stock root hosts it. It also hosts the
 * opt-in confirmation while mounted, as the classic `ConsentManager` does,
 * so a confirmation asked for from the dialog never waits on a banner that
 * is not on the page.
 */
import { defineAsyncComponent } from 'vue';

import { useOptInConfirmationHost } from '../../composables/kernel';
import { loadPrivacyChoicesDialog } from './load';

defineProps<{
	/** Skip the enter and exit animations. Defaults to the config's. */
	disableAnimation?: boolean;
}>();

const LazyPrivacyChoicesDialog = defineAsyncComponent(loadPrivacyChoicesDialog);
const LazyOptInConfirmation = defineAsyncComponent(
	() => import('../opt-in-confirmation.vue')
);
const optInConfirmationActive = useOptInConfirmationHost();
</script>

<template>
	<LazyOptInConfirmation
		v-if="optInConfirmationActive"
		:disable-animation="disableAnimation"
	/>
	<LazyPrivacyChoicesDialog :disable-animation="disableAnimation" />
</template>
