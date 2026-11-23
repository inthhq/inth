<script setup lang="ts">
import { showConsentSurface } from '@inth/sdk/surface-actions';

import { useConsentKernel } from '#inth/composables';

defineProps<{
	scenario:
		| 'ssr'
		| 'ssr-manifest'
		| 'client'
		| 'client-manifest'
		| 'repeat-visitor';
}>();

const kernel = useConsentKernel();

// Opens the dialog by the kernel's name for it, as the other benches do.
const openPreferences = function openPreferences() {
	showConsentSurface(kernel, 'dialog');
};
</script>

<template>
	<BenchmarkProbe :scenario="scenario" />
	<main style="padding: 2rem; font-family: system-ui, sans-serif">
		<h1>Nuxt Benchmark: {{ scenario }}</h1>
		<button
			id="open-preferences"
			type="button"
			@click="openPreferences"
		>
			Open Preferences
		</button>
	</main>
</template>
