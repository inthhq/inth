<!-- #region docs:consent-surfaces title="src/ConsentSurfaces.vue" -->
<script setup lang="ts">
import {
	ConsentBanner,
	ConsentDialogTrigger,
	ConsentManager,
} from '@inth/vue/vue-plugin';
</script>

<template>
	<!-- Render these in place of InthProvider, not next to it. -->
	<ConsentBanner :container="{ type: 'banner', edge: 'bottom' }" />
	<ConsentManager />
	<ConsentDialogTrigger />
</template>
<!-- #endregion docs:consent-surfaces -->
