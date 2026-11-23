<script setup lang="ts">
import type { ConsentLegalLinkKey } from '@inth/sdk/schema/config';
import legalStyles from '@inth/sdk/ui/styles/components/legal-links';

import '@inth/sdk/ui/styles/components/legal-links.css';
import { resolveLegalLinkEntries } from '@inth/sdk/ui/utils';
import { computed } from 'vue';

import { useConsentConfig } from '../../composables/config';
import { useSurfaceTranslations } from '../../composables/use-surface-translations';
import { slotAttrs } from '../../utils/slot-attrs';

/**
 * The policy links after the prompt's description, as React's
 * `InlineLegalLinks` renders them: a space first, and a comma inside every
 * link but the last. A link the config gives no `href` is skipped
 * (BNR-08).
 */
const props = defineProps<{
	links: readonly ConsentLegalLinkKey[];
}>();

const config = useConsentConfig();
const translations = useSurfaceTranslations();
const entries = computed(() =>
	resolveLegalLinkEntries(
		config.value.legalLinks,
		[...props.links],
		translations.value.legalLinks
	)
);
</script>

<!-- The tags sit tight against the text on purpose: a line break beside an interpolation would render as an extra space. -->
<template>
	<span
		v-if="entries.length > 0"
		v-bind="config.components?.['legal-links']?.root"
		>{{ ' '
		}}<span
			v-for="entry in entries"
			:key="entry.key"
			><a
				:href="entry.href"
				:target="entry.target"
				:rel="entry.rel"
				v-bind="
					slotAttrs(config.components?.link?.banner, legalStyles.legalLink)
				"
				:data-testid="`consent-banner-legal-link-${entry.key}`"
				>{{ entry.label }}{{ entry.separated ? ',' : '' }}</a
			>{{ entry.separated ? ' ' : '' }}</span
		></span
	>
</template>
