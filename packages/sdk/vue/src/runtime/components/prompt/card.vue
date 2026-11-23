<script setup lang="ts">
/**
 * The consent prompt as a Card. Only this component imports the
 * `consent-card` stylesheet, so a page that shows another container never
 * downloads it.
 */
import containerStyles from '@inth/sdk/ui/styles/components/consent-card';

// The container's classes override the surface's on the same elements,
// so its sheet must come after the surface's. Nuxt inlines a server
// render's sheets parent first, which would put this one first; importing
// the surface's sheet here puts it ahead, as the browser's chunks do.
import '@inth/sdk/ui/styles/components/consent-surface.css';
import '@inth/sdk/ui/styles/components/consent-card.css';

import type { ActionGroups, PromptContainer } from './prompt.model';
import PromptSurface from './surface.vue';

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
