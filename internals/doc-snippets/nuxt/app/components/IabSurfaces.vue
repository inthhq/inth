<!-- #region docs:iab-surfaces title="app/components/IabSurfaces.vue" -->
<script setup lang="ts">
import IABConsentBanner from '@inth/nuxt/components/iab-consent-banner';
import IABConsentDialog from '@inth/nuxt/components/iab-consent-dialog';
</script>

<template>
	<!-- Only for sites where every policy uses IAB TCF. ConsentRoot
	     switches between the IAB and standard surfaces for you. -->
	<IABConsentBanner />
	<IABConsentDialog initial-tab="purposes" />
</template>
<!-- #endregion docs:iab-surfaces -->
