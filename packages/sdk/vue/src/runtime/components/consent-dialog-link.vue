<script setup lang="ts">
import type { PolicyRight } from '@inth/sdk/schema/types';
import { activateOptOutLink } from '@inth/sdk/surface-actions';
import { resolveOptOutLink } from '@inth/sdk/surface-state';
import legalLinkStyles from '@inth/sdk/ui/styles/components/legal-links';

import '@inth/sdk/ui/styles/components/legal-links.css';
import { computed } from 'vue';

import {
	useConsentActiveUI,
	useConsentKernel,
	useHasConsentPreferences,
	usePolicyRule,
} from '../composables';
import { useResolvedPresentation } from '../composables/use-experiment';
import { useSurfaceTranslations } from '../composables/use-surface-translations';
import OptOutIcon from './opt-out-icon.vue';

const props = defineProps<{
	/**
	 * Persistent right this link exercises. Set to `'opt-out'` for a
	 * "Do Not Sell or Share" or "Your Privacy Choices" link.
	 */
	right?: Exclude<PolicyRight, 'disclosure'>;
}>();

const kernel = useConsentKernel();
const policy = usePolicyRule();
const activeUI = useConsentActiveUI();
const hasConsentUi = useHasConsentPreferences();
const translations = useSurfaceTranslations();
const presentation = useResolvedPresentation();

const isOptOut = computed(() => props.right === 'opt-out');
const optOutLink = computed(() =>
	isOptOut.value
		? resolveOptOutLink(translations.value, presentation.value?.optOutLink)
		: null
);
const showOptOutIcon = computed(
	() => optOutLink.value?.variant === 'privacy-choices'
);
// Names what the link opens, in the visitor's language.
const label = computed(() =>
	optOutLink.value
		? optOutLink.value.label
		: translations.value.consentManagerDialog.title
);

const onClick = function onClick() {
	if (optOutLink.value) {
		void activateOptOutLink(kernel, optOutLink.value.variant);
		return;
	}
	activeUI.value = 'manager';
};
</script>

<template>
	<button
		v-if="hasConsentUi"
		type="button"
		data-testid="consent-dialog-link"
		:data-inth-rights="policy.rights.join(' ')"
		:data-right="right"
		:data-opt-out-variant="optOutLink?.variant"
		@click="onClick"
	>
		<OptOutIcon
			v-if="showOptOutIcon"
			:class="legalLinkStyles.optOutIcon"
		/>
		<slot>{{ label }}</slot>
	</button>
</template>
