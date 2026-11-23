<script setup lang="ts">
/**
 * The consent prompt as a Drawer. Only this component imports the
 * `consent-drawer` stylesheet, so a page that shows another container never
 * downloads it.
 */
import containerStyles from '@inth/sdk/ui/styles/components/consent-drawer';

// The container's classes override the surface's on the same elements,
// so its sheet must come after the surface's. Nuxt inlines a server
// render's sheets parent first, which would put this one first; importing
// the surface's sheet here puts it ahead, as the browser's chunks do.
import '@inth/sdk/ui/styles/components/consent-surface.css';
import '@inth/sdk/ui/styles/components/consent-drawer.css';

import PromptSurface from './surface.vue';
import type { ActionGroups, PromptContainer } from './prompt.model';

defineProps<{
	container: PromptContainer;
	actionGroups?: ActionGroups;
	disableAnimation?: boolean;
}>();
</script>

<template>
	<PromptSurface
		:container="container"
		:action-groups="actionGroups"
		:presentation="containerStyles"
		:disable-animation="disableAnimation"
	/>
</template>
