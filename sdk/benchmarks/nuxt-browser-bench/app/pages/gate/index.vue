<script setup lang="ts">
/**
 * Consent gate page: CookieBench's Nuxt fixture (`with-c15t-nuxt/app/consent.vue`)
 * on this bench's local backend. The module's build-time `manifest()` mode
 * resolves each visitor on the server (the route plugin leaves `/gate` on
 * it), app.vue mounts the static `<ConsentRoot />`, and this page registers
 * the gated scripts with the module's loader and bridges the snapshot.
 */
import {
	gatePageCSS,
	gatePageHTML,
	gateScripts,
	updateGateBridge,
} from '@c15t/benchmarking/consent-gate-page';
import { onMounted, watch } from 'vue';

import { useConsentSnapshot, useScriptLoader } from '#c15t/composables';

const snapshot = useConsentSnapshot();
// The scripts come from the page URL, so they register in the browser, as
// the other gate pages do with useScriptLoader.
useScriptLoader(gateScripts());
onMounted(() => {
	updateGateBridge(snapshot.value);
});
watch(snapshot, (value) => {
	if (import.meta.client) {
		updateGateBridge(value);
	}
});
</script>

<template>
	<component is="style">{{ gatePageCSS }}</component>
	<div v-html="gatePageHTML"></div>
</template>
