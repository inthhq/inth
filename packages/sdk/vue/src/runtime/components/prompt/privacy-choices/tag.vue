<script setup lang="ts">
import surfaceStyles from '@inth/sdk/ui/styles/components/consent-surface';

import '@inth/sdk/ui/styles/components/consent-surface.css';
import type { BrandingTag } from '@inth/sdk/ui/utils';

import { useConsentConfig } from '../../../composables/config';
import { useSurfaceTranslations } from '../../../composables/use-surface-translations';
import { slotAttrs } from '../../../utils/slot-attrs';
import BrandingIcon from '../../branding-icon.vue';

/** The "Consent by [INTH]" tag on a Privacy Choices prompt (BNR-11, §5). */
defineProps<{
	tag: BrandingTag;
	/** The presentation sheet's own `.tag` class, which places it. */
	className?: string;
}>();

const config = useConsentConfig();
const translations = useSurfaceTranslations();
</script>

<template>
	<a
		v-bind="
			slotAttrs(config.components?.tag?.banner, [surfaceStyles.tag, className])
		"
		:href="tag.href"
		target="_blank"
		rel="noreferrer"
		:data-branding="tag.brand"
		data-testid="consent-banner-branding"
	>
		<span>{{ translations.common.securedBy }}</span>
		<BrandingIcon
			:branding="tag.brand === 'inth' ? 'inth' : 'c15t'"
			:class="surfaceStyles.tagMark"
		/>
		<span :class="surfaceStyles.visuallyHidden">{{
			tag.brand === 'inth' ? 'Inth' : 'c15t'
		}}</span>
	</a>
</template>
