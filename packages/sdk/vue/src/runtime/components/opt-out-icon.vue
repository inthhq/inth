<script setup lang="ts">
import { CPPA_OPT_OUT_ICON } from '@inth/sdk/ui/utils/opt-out-icon';
</script>

<template>
	<svg
		aria-hidden="true"
		focusable="false"
		:viewBox="CPPA_OPT_OUT_ICON.viewBox"
		xmlns="http://www.w3.org/2000/svg"
	>
		<path
			v-for="path in CPPA_OPT_OUT_ICON.paths"
			:key="path.d"
			:clip-rule="path.evenOdd ? 'evenodd' : undefined"
			:d="path.d"
			:fill="path.fill"
			:fill-rule="path.evenOdd ? 'evenodd' : undefined"
		/>
	</svg>
</template>
