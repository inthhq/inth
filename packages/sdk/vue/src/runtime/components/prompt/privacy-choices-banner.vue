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
import { computed, inject, ref, shallowRef, watch } from 'vue';

import { useConsentSnapshot } from '../../composables/kernel';
import { useHydrationHold } from '../privacy-choices/hydration-hold';
import { useRetryableComponent } from '../privacy-choices/retryable-component';
import type { RetryableComponent } from '../privacy-choices/retryable-component';
import {
	privacyChoicesPresentations,
	privacyChoicesPresentationsKey,
} from './privacy-choices/presentations';
import type { PrivacyChoicesPresentations } from './privacy-choices/presentations';
import type {
	ActionGroups,
	PrivacyChoicesContainer,
} from './privacy-choices/types';

const props = defineProps<{
	container: PrivacyChoicesContainer;
	/** The policy's first-layer actions, in the host's order. */
	actionGroups?: ActionGroups;
	disableAnimation?: boolean;
}>();

const snapshot = useConsentSnapshot();
const owed = ref(snapshot.value.activeUI === 'banner');

// Under the Nuxt plugin's deferred context, a presentation the server
// rendered hydrates once its chunk arrives: until then the banner keeps
// the server's snapshot, so the presentation hydrates against the HTML.
const releaseHydration = owed.value ? useHydrationHold() : () => undefined;

const loaders = inject(
	privacyChoicesPresentationsKey,
	privacyChoicesPresentations
);
const type = computed<keyof PrivacyChoicesPresentations>(() => {
	switch (props.container.desktop.type) {
		case 'banner':
			return 'bar';
		case 'drawer':
			return 'drawer';
		default:
			return 'card';
	}
});
// One loader per presentation shown, made when first shown. A failed one
// stays failed until the next trigger below.
const loads: Partial<
	Record<keyof PrivacyChoicesPresentations, RetryableComponent>
> = {};
const load = (name: keyof PrivacyChoicesPresentations): RetryableComponent => {
	loads[name] ??= useRetryableComponent(loaders[name], releaseHydration);
	return loads[name];
};
const current = shallowRef(load(type.value));
watch(type, (name) => {
	current.value = load(name);
});

// A failed chunk leaves no consent UI: the classic banner stays closed
// under this design. Load again the next time the banner is owed, or on
// the next snapshot while it is.
const retry = () => {
	if (snapshot.value.activeUI === 'banner') {
		current.value.retry();
	}
};
watch(
	() => snapshot.value.activeUI,
	(activeUI) => {
		if (activeUI === 'banner') {
			owed.value = true;
		}
	},
	{ flush: 'sync' }
);
watch(snapshot, retry);
</script>

<template>
	<component
		:is="current.component.value"
		v-if="owed && !current.failed.value"
		:container="container"
		:action-groups="actionGroups"
		:disable-animation="disableAnimation"
		@vue:mounted="releaseHydration"
	/>
</template>
