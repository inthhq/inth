<!-- #region docs:script-loader title="app/components/TenantAnalytics.vue" -->
<script setup lang="ts">
import { posthog } from '@inth/integrations/posthog';

const props = defineProps<{ projectKey: string }>();

// Auto-imported by the module. Registers with the app's one loader: the
// script loads while measurement is allowed, follows the prop, and leaves
// when this component unmounts.
useScriptLoader(() => [posthog({ id: props.projectKey })]);
</script>

<template>
	<slot />
</template>
<!-- #endregion docs:script-loader -->
