<script setup lang="ts">
import type { KernelBranding } from '@inth/sdk/engine';
import { BRAND_MARKS, resolveBrandMark } from '@inth/sdk/ui/utils';
import { computed } from 'vue';

const props = defineProps<{ branding?: KernelBranding | null }>();

const glyph = computed(() => BRAND_MARKS[resolveBrandMark(props.branding)]);
</script>
<template>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		:viewBox="glyph.viewBox"
		fill="none"
		aria-hidden="true"
	>
		<path
			v-for="path in glyph.paths"
			:key="path.d"
			fill="currentColor"
			:fill-rule="path.evenOdd ? 'evenodd' : undefined"
			:clip-rule="path.evenOdd ? 'evenodd' : undefined"
			:d="path.d"
		/>
	</svg>
</template>
