<script setup lang="ts">
import { ConsentDialogLink, InthProvider } from '@inth/vue/vue-plugin';

import HomePage from './home-page.vue';
</script>

<template>
	<InthProvider />
	<HomePage />
	<footer>
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</footer>
</template>
