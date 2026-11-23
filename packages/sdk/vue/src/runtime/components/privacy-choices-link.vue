<script setup lang="ts">
/**
 * The "Your Privacy Choices" footer link, as React's `PrivacyChoicesLink`
 * renders it. Activating it always opens the preference dialog and never
 * records an opt-out on its own.
 *
 * Under an opt-out policy with the `opt-out` right it renders the title
 * resolved from `presentation.optOutLink` (or the `variant` prop), with the
 * California Privacy Protection Agency opt-out icon beside both Privacy
 * Choices titles and none beside "Do Not Sell or Share My Personal
 * Information". Under `design: 'privacy-choices'` it is also the way back
 * into the dialog under an opt-in policy, in the US or the EU: it reads
 * "Your Privacy Choices" there, with no opt-out icon, since no opt-out
 * right is offered.
 *
 * Renders nothing when the active policy gives no opt-out right (on the
 * classic design), when no policy has resolved yet, or when an external
 * consent source owns consent.
 */
import type { OptOutLinkVariant } from '@inth/sdk/surface-state';
import {
	resolveConsentDesign,
	resolvePrivacyChoicesLink,
} from '@inth/sdk/surface-state';

import '@inth/sdk/ui/styles/components/consent-banner.css';
import bannerStyles from '@inth/sdk/ui/styles/components/consent-banner';
import { computed } from 'vue';

import { useConsentActiveUI, useConsentSnapshot } from '../composables';
import { useResolvedPresentation } from '../composables/experiment';
import { useSurfaceTranslations } from '../composables/use-surface-translations';
import OptOutIcon from './opt-out-icon.vue';

const props = defineProps<{
	/**
	 * Override `presentation.optOutLink` for this link: `'privacy-choices'`,
	 * `'california-privacy-choices'`, or `'do-not-sell'`.
	 */
	variant?: OptOutLinkVariant;
}>();

const snapshot = useConsentSnapshot();
const activeUI = useConsentActiveUI();
const translations = useSurfaceTranslations();
const presentation = useResolvedPresentation();

const link = computed(() =>
	resolvePrivacyChoicesLink(snapshot.value, translations.value, {
		design: resolveConsentDesign(presentation.value),
		variant: props.variant ?? presentation.value?.optOutLink,
	})
);

const onClick = function onClick() {
	activeUI.value = 'manager';
};
</script>

<template>
	<button
		v-if="link"
		type="button"
		data-testid="privacy-choices-link"
		:data-inth-rights="snapshot.policyRule.rights.join(' ')"
		:data-opt-out-variant="
			link.variant === 'choices' ? undefined : link.variant
		"
		@click="onClick"
	>
		<OptOutIcon
			v-if="link.icon"
			:class="bannerStyles.optOutIcon"
		/>
		<slot>{{ link.label }}</slot>
	</button>
</template>
