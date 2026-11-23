<script setup lang="ts">
/**
 * The consent prompt as a Banner. Only this component imports the
 * `consent-banner` stylesheet, so a page that shows another container never
 * downloads it.
 */
import containerStyles from '@inth/sdk/ui/styles/components/consent-banner';

import '@inth/sdk/ui/styles/components/consent-banner.css';

import PromptSurface from './surface.vue';
import type { ActionGroups, PromptContainer } from './types';

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
