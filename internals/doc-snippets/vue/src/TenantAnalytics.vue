<!-- #region docs:script-loader title="src/TenantAnalytics.vue" -->
<script setup lang="ts">
import { posthog } from '@inth/integrations/posthog';
import { useScriptLoader } from '@inth/vue/vue-plugin';

const props = defineProps<{ projectKey: string }>();

// Registers with the app's one loader. The script loads while measurement
// is allowed, follows the prop, and leaves when this component unmounts.
useScriptLoader(() => [posthog({ id: props.projectKey })]);
</script>

<template>
	<slot />
</template>
<!-- #endregion docs:script-loader -->
