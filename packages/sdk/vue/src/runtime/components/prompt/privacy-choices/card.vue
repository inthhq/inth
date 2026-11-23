<script setup lang="ts">
/**
 * The Privacy Choices prompt as a Card. Only this component imports the
 * `consent-card` stylesheet, so a page that shows another presentation
 * never downloads it.
 */
import presentation from '@inth/sdk/ui/styles/components/consent-card';

import '@inth/sdk/ui/styles/components/consent-card.css';

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
