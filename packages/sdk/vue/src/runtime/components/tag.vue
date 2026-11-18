<script setup lang="ts">
import brandingStyles from '@inth/sdk/ui/styles/components/branding';
import { resolveBrandingTag } from '@inth/sdk/ui/utils';
import type { BrandingSurface } from '@inth/sdk/ui/utils';

import '@inth/sdk/ui/styles/components/branding.css';
import { computed, onMounted, ref } from 'vue';

import { useConsentConfig, useConsentInit } from '#inth/composables';

import { useSurfaceTranslations } from '../composables/use-surface-translations';
import { slotAttrs } from '../utils/slot-attrs';
import ConsentBrandingIcon from './branding-icon.vue';

const props = defineProps<{
	/** The surface the tag sits on. */
	surface: BrandingSurface;
}>();

const init = useConsentInit();
const config = useConsentConfig();
const translations = useSurfaceTranslations();

// Resolved after mount so server-rendered and hydrated HTML match — reading
// window.location during hydration produces a mismatch warning.
const hostname = ref('');
onMounted(() => {
	hostname.value = window.location.hostname;
});

const tag = computed(() =>
	resolveBrandingTag({
		branding: init.value?.branding,
		hostname: hostname.value,
		styles: brandingStyles,
		surface: props.surface,
	})
);

const securedBy = computed(
	() =>
		translations.value.bundle?.common?.securedBy ??
		translations.value.english.common.securedBy
);
</script>

<template>
	<a
		v-if="tag"
		v-bind="
			slotAttrs(config.components?.tag?.[tag.componentKey], tag.classes.root)
		"
		:href="tag.href"
		:data-branding="tag.brand"
		:data-variant="tag.variant"
		:data-testid="tag.testId"
	>
		<span
			v-bind="slotAttrs(config.components?.tag?.content, tag.classes.content)"
			data-slot="tag-content"
		>
			<span :class="tag.classes.copy">
				<span :class="tag.classes.text"> {{ securedBy }} </span>
			</span>
			<span
				dir="ltr"
				:class="tag.classes.wordmark"
			>
				<ConsentBrandingIcon
					v-if="tag.brand === 'inth'"
					branding="inth"
				/>
				<template v-else>
					<span :class="tag.classes.mark">
						<ConsentBrandingIcon branding="c15t" />
					</span>
					<span :class="tag.classes.label">c15t</span>
				</template>
			</span>
		</span>
	</a>
</template>
