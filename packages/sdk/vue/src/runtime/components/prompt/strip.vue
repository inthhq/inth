<script setup lang="ts">
/**
 * The consent prompt as a Banner. Only this component imports the
 * `consent-banner` stylesheet, so a page that shows another container never
 * downloads it. The file is named `strip`, not `banner`: it loads on
 * demand, Vite names its chunk after it, and content blockers drop files
 * named like a consent banner.
 */
import containerStyles from '@inth/sdk/ui/styles/components/consent-banner';

// The container's classes override the surface's on the same elements,
// so its sheet must come after the surface's. Nuxt inlines a server
// render's sheets parent first, which would put this one first; importing
// the surface's sheet here puts it ahead, as the browser's chunks do.
import '@inth/sdk/ui/styles/components/consent-surface.css';
import '@inth/sdk/ui/styles/components/consent-banner.css';

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
