<script setup lang="ts">
import type { ConsentLegalLinkKey } from '@inth/sdk/schema/config';
import legalStyles from '@inth/sdk/ui/styles/components/legal-links';
import { resolveLegalLinkEntries } from '@inth/sdk/ui/utils';

import '@inth/sdk/ui/styles/components/legal-links.css';
import { computed } from 'vue';

import { useConsentConfig } from '#inth/composables';

import { useSurfaceTranslations } from '../composables/use-surface-translations';

const props = defineProps<{
	context: 'banner' | 'dialog' | 'manager';
	/** Overrides the config's URL for this link. */
	href?: string;
	link: ConsentLegalLinkKey;
}>();

const config = useConsentConfig();
const translations = useSurfaceTranslations();

// A link with no `href`, passed or in the config, renders nothing, as in
// the other SDKs.
const entry = computed(() => {
	const configured = config.value.legalLinks?.[props.link];
	const href = props.href ?? configured?.href;
	return href
		? resolveLegalLinkEntries(
				{ [props.link]: { ...configured, href } },
				[props.link],
				translations.value?.legalLinks
			)[0]
		: undefined;
});

const testId = computed(() => {
	const surface =
		props.context === 'banner' ? 'consent-banner' : 'consent-dialog';
	return `${surface}-legal-link-${props.link}`;
});
</script>

<template>
	<a
		v-if="entry"
		v-bind="config.components?.link?.[context]"
		:href="entry.href"
		:target="entry.target"
		:rel="entry.rel"
		:data-testid="testId"
		:class="legalStyles.legalLink"
	>
		<slot>{{ entry.label }}</slot>
	</a>
</template>
