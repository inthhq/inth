<script setup lang="ts">
/**
 * The gate page's article without any consent library: the LCP control.
 * `run-gate.ts` serves it from the zero-consent baseline build
 * (INTH_BENCH_BASELINE=1), which omits the `@inth/nuxt` module.
 */
import {
	gatePageCSS,
	gatePageHTML,
} from '@inth/benchmarking/consent-gate-page';
</script>

<template>
	<component is="style">{{ gatePageCSS }}</component>
	<div v-html="gatePageHTML"></div>
</template>
