<script setup lang="ts">
import type { ConsentLegalLinkKey } from '@inth/sdk/schema/config';
import { resolveLegalLinkEntries } from '@inth/sdk/ui/utils';

import '@inth/sdk/ui/styles/components/legal-links.css';
import { computed } from 'vue';

import { useConsentConfig } from '#inth/composables';

import { useSurfaceTranslations } from '../composables/use-surface-translations';
import ConsentLink from './link.vue';

const props = defineProps<{
	context: 'banner' | 'dialog' | 'manager';
	links: ConsentLegalLinkKey[];
}>();

const config = useConsentConfig();
const translations = useSurfaceTranslations();

// A link the config gives no `href` is skipped, as in the other SDKs.
const entries = computed(() =>
	resolveLegalLinkEntries(
		config.value.legalLinks,
		props.links,
		translations.value?.legalLinks
	)
);
</script>

<!--
	Inline after the description, as the React banner's `InlineLegalLinks`:
	a space first, and a comma inside every link but the last, followed by a
	space outside it. The tags sit tight against the text on purpose: a line
	break beside an interpolation would render as an extra space.
-->
<template>
	<span
		v-if="entries.length > 0"
		v-bind="config.components?.['legal-links']?.root"
		data-testid="consent-legal-links"
		>{{ ' '
		}}<span
			v-for="entry in entries"
			:key="entry.key"
			><ConsentLink
				:context="context"
				:link="entry.key"
				>{{ entry.label }}{{ entry.separated ? ',' : '' }}</ConsentLink
			>{{ entry.separated ? ' ' : '' }}</span
		></span
	>
</template>
