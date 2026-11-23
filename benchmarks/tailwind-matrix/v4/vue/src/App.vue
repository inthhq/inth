<script setup lang="ts">
import { ConsentDialogLink, InthProvider } from '@inth/vue/vue-plugin';
</script>

<template>
	<p
		class="bg-emerald-600 text-white"
		data-testid="tailwind-probe"
	>
		Tailwind utilities are active on this page.
	</p>
	<ConsentDialogLink />
	<InthProvider />
</template>
