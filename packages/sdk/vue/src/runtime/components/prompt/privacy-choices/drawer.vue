<script setup lang="ts">
/**
 * The Privacy Choices prompt as a Drawer. Only this component imports the
 * `consent-drawer` stylesheet, so a page that shows another presentation
 * never downloads it.
 */
import presentation from '@inth/sdk/ui/styles/components/consent-drawer';

import '@inth/sdk/ui/styles/components/consent-drawer.css';

import PrivacyChoicesSurface from './surface.vue';
import type { ActionGroups, PrivacyChoicesContainer } from './types';

defineProps<{
	container: PrivacyChoicesContainer;
	actionGroups?: ActionGroups;
	disableAnimation?: boolean;
}>();
</script>

<template>
	<PrivacyChoicesSurface
		:container="container"
		:action-groups="actionGroups"
		:presentation="presentation"
		:disable-animation="disableAnimation"
	/>
</template>
