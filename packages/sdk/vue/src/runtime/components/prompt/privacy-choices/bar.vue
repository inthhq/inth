<script setup lang="ts">
/**
 * The Privacy Choices prompt as a Banner. Only this component imports the
 * `consent-bar` stylesheet, so a page that shows another presentation
 * never downloads it.
 */
import presentation from '@inth/sdk/ui/styles/components/consent-bar';

import '@inth/sdk/ui/styles/components/consent-bar.css';

import PrivacyChoicesSurface from './surface.vue';
import type { PrivacyChoicesContainer } from './types';

defineProps<{
	container: PrivacyChoicesContainer;
	disableAnimation?: boolean;
}>();
</script>

<template>
	<PrivacyChoicesSurface
		:container="container"
		:presentation="presentation"
		:disable-animation="disableAnimation"
	/>
</template>
