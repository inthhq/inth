<script setup lang="ts">
import { useConsentActiveUI } from '@inth/vue/vue-plugin';

import ConsentPrompt from './consent-prompt.vue';
import HomePage from './home-page.vue';

const activeUI = useConsentActiveUI();
</script>

<template>
	<ConsentPrompt />
	<HomePage />
	<footer>
		<button
			type="button"
			@click="activeUI = 'manager'"
		>
			Privacy settings
		</button>
	</footer>
</template>
