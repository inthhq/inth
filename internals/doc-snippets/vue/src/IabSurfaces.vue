<!-- #region docs:iab-surfaces title="src/IabSurfaces.vue" -->
<script setup lang="ts">
import { IABConsentBanner, IABConsentDialog } from '@inth/vue/vue-plugin';
</script>

<template>
	<!-- Only for sites where every policy uses IAB TCF. ConsentRoot
	     switches between the IAB and standard surfaces for you. -->
	<IABConsentBanner />
	<IABConsentDialog initial-tab="purposes" />
</template>
<!-- #endregion docs:iab-surfaces -->
