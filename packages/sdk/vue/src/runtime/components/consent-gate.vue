<script setup lang="ts">
import { evaluateConsent } from '@inth/sdk/engine';
import type { AllConsentNames } from '@inth/sdk/engine';
import gateStyles from '@inth/sdk/ui/styles/components/consent-gate';

import '@inth/sdk/ui/styles/components/consent-gate.css';
import { computed, watch } from 'vue';

import {
	useConsentActiveUI,
	useConsentKernel,
	useConsentSnapshot,
} from '../composables';
import { useConsentConfig } from '../composables/config';
import { useSurfaceTranslations } from '../composables/use-surface-translations';
import { slotAttrs } from '../utils/slot-attrs';
import ConsentButton from './button.vue';

const props = defineProps<{ category: AllConsentNames }>();
const snapshot = useConsentSnapshot();
const kernel = useConsentKernel();
const activeUI = useConsentActiveUI();
const translations = useSurfaceTranslations();
const config = useConsentConfig();
const allowed = computed(() =>
	evaluateConsent(
		{ category: props.category },
		snapshot.value,
		snapshot.value.evaluatedAt
	)
);

// The preferences the button opens list this category, as React's gate
// registers it.
watch(
	() => props.category,
	(category) => {
		kernel.set.registerConsentCategories([category]);
	},
	{ immediate: true }
);

const categoryTitle = computed(() => {
	const { consentTypes } = translations.value;
	const category = props.category as keyof typeof consentTypes;
	return consentTypes[category]?.title ?? props.category;
});

/**
 * Under a strict policy that leaves this category out, no choice can allow
 * the content, so the placeholder says so and offers no button.
 */
const policyBlocked = computed(() => {
	const { scope, scopeMode } = snapshot.value.policyRule;
	return (
		scopeMode === 'strict' &&
		props.category !== 'necessary' &&
		!(scope as readonly string[]).includes('*') &&
		!scope.includes(props.category)
	);
});

// The same `consentGate.*` copy the React and Svelte gates show.
const title = computed(() => {
	const { consentGate } = translations.value;
	if (policyBlocked.value) {
		return consentGate.policyBlocked;
	}
	return consentGate.title.replace('{category}', categoryTitle.value);
});
const actionLabel = computed(() => {
	return translations.value.consentGate.actionButton.replace(
		'{category}',
		categoryTitle.value
	);
});

const openPreferences = function openPreferences() {
	activeUI.value = 'manager';
};
</script>

<template>
	<slot v-if="allowed" />
	<slot
		v-else
		name="placeholder"
	>
		<div
			v-bind="
				slotAttrs(
					config.components?.['consent-gate']?.root,
					gateStyles.placeholder
				)
			"
			data-testid="consent-gate-placeholder"
		>
			<div
				v-bind="
					slotAttrs(
						config.components?.['consent-gate']?.title,
						gateStyles.title
					)
				"
				data-testid="consent-gate-title"
			>
				{{ title }}
			</div>
			<ConsentButton
				v-if="!policyBlocked"
				v-bind="config.components?.['consent-gate']?.button"
				variant="primary"
				mode="stroke"
				size="small"
				data-testid="consent-gate-button"
				@click="openPreferences"
			>
				{{ actionLabel }}
			</ConsentButton>
		</div>
	</slot>
</template>
