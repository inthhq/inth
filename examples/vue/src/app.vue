<!-- #region docs:app -->
<script setup lang="ts">
import { ConsentDialogLink, InthProvider } from '@inth/vue/vue-plugin';
</script>

<template>
	<InthProvider />
	<main>
		<h1>Inth with Vue</h1>
		<p>PostHog loads after you allow measurement.</p>
	</main>
	<footer>
		<ConsentDialogLink>Privacy settings</ConsentDialogLink>
	</footer>
</template>
<!-- #endregion docs:app -->
