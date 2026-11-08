<script setup lang="ts">
/**
 * The gate page's article without any consent library: the LCP control.
 * `run-gate.ts` serves it from the zero-consent baseline build
 * (C15T_BENCH_BASELINE=1), which omits the `@c15t/vue` module.
 */
import {
	gatePageCSS,
	gatePageHTML,
} from '@c15t/benchmarking/consent-gate-page';
</script>

<template>
	<component is="style">{{ gatePageCSS }}</component>
	<div v-html="gatePageHTML"></div>
</template>
