<!-- #region docs:consent-surfaces title="app/components/ConsentSurfaces.vue" -->
<script setup lang="ts">
// The module registers ConsentDialogTrigger globally. It does not register
// the banner or the dialog, so import them.
import ConsentBanner from '@inth/nuxt/components/consent-banner';
import ConsentDialog from '@inth/nuxt/components/consent-dialog';
</script>

<template>
	<!-- Render these in app.vue in place of InthProvider, not next to it. -->
	<ConsentBanner :container="{ type: 'banner', edge: 'bottom' }" />
	<ConsentDialog />
	<ConsentDialogTrigger />
</template>
<!-- #endregion docs:consent-surfaces -->
