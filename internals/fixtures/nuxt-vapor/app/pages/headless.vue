<script setup vapor lang="ts">
// `app.vue` swaps InthProvider for the Vapor ConsentPrompt on this page.
definePageMeta({ headlessConsent: true });
</script>

<template>
	<ConsentExample />
</template>
