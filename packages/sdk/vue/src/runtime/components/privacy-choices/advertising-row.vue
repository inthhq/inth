<script setup lang="ts">
import { resolveAdvertisingRowCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/privacy-choices';

import '@inth/sdk/ui/styles/components/privacy-choices.css';
import { computed } from 'vue';

import { useSurfaceTranslations } from '../../composables/use-surface-translations';

/** The read-only US advertising row: it follows the sale choice (LAW-05, CAT-08). */
const props = defineProps<{
	on: boolean;
	idPrefix: string;
	testId?: 'consent-dialog-advertising-row';
}>();

const translations = useSurfaceTranslations();
const copy = computed(() =>
	resolveAdvertisingRowCopy(translations.value, props.on)
);
</script>

<template>
	<div
		:class="styles.category"
		data-category="advertising"
		:data-testid="testId"
	>
		<div :class="styles.categoryRow">
			<div :class="styles.categoryText">
				<span
					:class="styles.categoryName"
					:id="`${idPrefix}-advertising`"
				>
					{{ copy.title }}
				</span>
				<span
					:class="styles.categoryDescription"
					:id="`${idPrefix}-advertising-description`"
				>
					{{ copy.description }}
				</span>
			</div>
			<span
				:class="styles.categoryState"
				:aria-describedby="`${idPrefix}-advertising-description`"
			>
				{{ copy.state }}
			</span>
		</div>
	</div>
</template>
