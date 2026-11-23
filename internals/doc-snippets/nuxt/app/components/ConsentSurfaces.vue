<!-- #region docs:consent-surfaces title="app/components/ConsentSurfaces.vue" -->
<script setup lang="ts">
// The module registers ConsentDialogTrigger globally. It does not register
// the banner or the dialog, so import them.
import ConsentBanner from '@inth/nuxt/components/consent-banner';
import ConsentManager from '@inth/nuxt/components/consent-manager';
</script>

<template>
	<!-- Render these in app.vue in place of InthProvider, not next to it. -->
	<ConsentBanner :container="{ type: 'banner', edge: 'bottom' }" />
	<ConsentManager />
	<ConsentDialogTrigger />
</template>
<!-- #endregion docs:consent-surfaces -->
