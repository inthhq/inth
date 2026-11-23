<script setup lang="ts">
/**
 * The stock banner's Privacy Choices design (`design: 'privacy-choices'`).
 * It loads the prompt for the resolved container once a choice is owed,
 * and keeps it mounted after, so its exit, the page announcement and the
 * focus return outlive the prompt.
 *
 * One chunk per presentation, each with its own stylesheet, so a page
 * downloads only the presentation it shows. A page that never owes a
 * choice, or keeps the classic design, downloads none of them.
 */
import { computed, inject, ref, watch } from 'vue';

import { useConsentSnapshot } from '../../composables/kernel';
import { setDialogWarmDesign } from '../lazy-surfaces';
import {
	privacyChoicesPresentations,
	privacyChoicesPresentationsKey,
} from './privacy-choices/presentations';
import type { PrivacyChoicesContainer } from './privacy-choices/types';

const props = defineProps<{
	container: PrivacyChoicesContainer;
	disableAnimation?: boolean;
}>();

// Idle warming then skips the classic dialog, which this page never shows.
setDialogWarmDesign('privacy-choices');

const snapshot = useConsentSnapshot();
const owed = ref(snapshot.value.activeUI === 'banner');
watch(
	() => snapshot.value.activeUI,
	(activeUI) => {
		if (activeUI === 'banner') {
			owed.value = true;
		}
	},
	{ flush: 'sync' }
);

const presentations = inject(
	privacyChoicesPresentationsKey,
	privacyChoicesPresentations
);
const presentation = computed(() => {
	switch (props.container.desktop.type) {
		case 'banner':
			return presentations.bar;
		case 'drawer':
			return presentations.drawer;
		default:
			return presentations.card;
	}
});
</script>

<template>
	<component
		:is="presentation"
		v-if="owed"
		:container="container"
		:disable-animation="disableAnimation"
	/>
</template>
