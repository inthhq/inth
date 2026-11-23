<!-- #region docs:bottom-bar title="src/CookieBanner.vue" -->
<script setup lang="ts">
import ConsentBanner from '@inth/vue/runtime/components/consent-banner.vue';
</script>

<template>
	<!-- The stock banner, drawn as a full-width Banner along the bottom edge. -->
	<ConsentBanner :container="{ edge: 'bottom', type: 'banner' }" />
</template>
<!-- #endregion docs:bottom-bar -->
