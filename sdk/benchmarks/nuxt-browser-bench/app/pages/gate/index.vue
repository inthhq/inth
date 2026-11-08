<script setup lang="ts">
/**
 * Consent gate page: CookieBench's Nuxt fixture (`with-c15t-nuxt/app/consent.vue`)
 * on this bench's local backend. The module's build-time `manifest()` mode
 * resolves each visitor on the server (the route plugin leaves `/gate` on
 * it), app.vue mounts the static `<ConsentRoot />`, and this page registers
 * the gated scripts with core's script loader and bridges the snapshot.
 */
import {
	gatePageCSS,
	gatePageHTML,
	gateScripts,
	updateGateBridge,
} from '@c15t/benchmarking/consent-gate-page';
import { createScriptLoader } from '@c15t/core/modules/script-loader';
import { onMounted, onUnmounted, watch } from 'vue';

import { useConsentKernel, useConsentSnapshot } from '#c15t/composables';

const kernel = useConsentKernel();
const snapshot = useConsentSnapshot();
let loader: ReturnType<typeof createScriptLoader> | undefined;
onMounted(() => {
	updateGateBridge(snapshot.value);
	loader = createScriptLoader({ kernel, scripts: gateScripts() });
});
watch(snapshot, (value) => {
	if (import.meta.client) {
		updateGateBridge(value);
	}
});
onUnmounted(() => loader?.dispose());
</script>

<template>
	<component is="style">{{ gatePageCSS }}</component>
	<div v-html="gatePageHTML"></div>
</template>
