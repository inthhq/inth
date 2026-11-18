<script setup lang="ts">
import { ConsentDialogLink, ConsentRoot } from '@inth/vue/vue-plugin';

import HomePage from './HomePage.vue';
</script>

<template>
	<ConsentRoot />
	<HomePage />
	<footer>
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</footer>
</template>
