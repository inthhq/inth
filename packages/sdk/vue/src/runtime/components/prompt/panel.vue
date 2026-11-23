<script setup lang="ts">
/**
 * The options the consent prompt shows in place: the cookie categories
 * in the EU, the rights row and Preferences in the US. Loaded on
 * Customize, or at once by a side Drawer, with the stylesheets they need:
 * the in-place panel, then the dialog's rows over it, which carry their
 * own switch and category rows.
 */
import { resolveSaleRight } from '@inth/sdk/engine';
import type { SaveUISource } from '@inth/sdk/engine';
import { resolvePreferencesRowCopy } from '@inth/sdk/surface-state';
import type { PrivacyChoicesPromptVariant } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import '@inth/sdk/ui/styles/components/consent-expand.css';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';

import '@inth/sdk/ui/styles/components/consent-dialog.css';
import { computed, onMounted, ref } from 'vue';

import { useConsentConfig } from '../../composables/config';
import { useConsentSnapshot } from '../../composables/use-consent-kernel';
import { useSurfaceTranslations } from '../../composables/use-surface-translations';
import AdvertisingRow from '../parts/advertising-row.vue';
import CategoryGroup from '../parts/category-group.vue';
import { useChoiceDraft } from '../parts/use-choice-draft';
import SaleRightsRow from '../parts/rights-row.vue';

/**
 * The options for the prompt's variant (BNR-14, BNR-15):
 *
 * - EU: the cookie categories, staged on the prompt's draft until a Save,
 *   Accept or Reject.
 * - US opt-in: the rights row, which applies as in the dialog, then
 *   Preferences.
 * - US notice: the rights row, which applies at once (LAW-04).
 *
 * Banner panels always use accordions, never sheets (PERM-01).
 */
const props = defineProps<{
	variant: PrivacyChoicesPromptVariant;
	/** Prefix for element ids inside the panel (SR-05). */
	idPrefix: string;
	uiSource?: SaveUISource;
}>();

const emit = defineEmits<{
	/** The options rendered, so the prompt can focus the first one. */
	ready: [];
}>();
onMounted(() => emit('ready'));

const config = useConsentConfig();
const snapshot = useConsentSnapshot();
const translations = useSurfaceTranslations();
const { state: draftState } = useChoiceDraft();

/**
 * Preferences in a US panel: the cookie categories behind a disclosure.
 * The category that decides sale follows the rights row instead of having
 * a switch of its own (LAW-05, CAT-08).
 */
const right = computed(() => resolveSaleRight(snapshot.value));
const sale = computed(() =>
	right.value.available ? right.value.category : null
);
const onCount = computed(
	() =>
		draftState.value.displayedCategories.filter(
			(name) =>
				name !== 'necessary' &&
				name !== sale.value &&
				draftState.value.values[name]
		).length
);
const preferencesOpen = ref(false);
const preferencesCopy = computed(() =>
	resolvePreferencesRowCopy(translations.value, onCount.value)
);
const preferencesId = computed(() => `${props.idPrefix}-preferences`);
</script>

<template>
	<CategoryGroup
		v-if="variant === 'choice'"
		:id-prefix="idPrefix"
		test-id-prefix="consent-banner"
	/>
	<template v-else-if="variant === 'us-consent' || variant === 'notice'">
		<SaleRightsRow
			:id-prefix="idPrefix"
			test-id-prefix="consent-banner"
			:ui-source="uiSource"
			:part="config.components?.banner?.rightsRow"
		/>
		<div v-if="variant === 'us-consent'">
			<button
				type="button"
				:class="styles.navRow"
				:aria-expanded="preferencesOpen"
				:aria-controls="preferencesId"
				data-testid="consent-banner-preferences-row"
				@click="preferencesOpen = !preferencesOpen"
			>
				<span :class="styles.navRowLabel"
					>{{ preferencesCopy.title
					}}<span :class="styles.navRowMeta"
						>{{ preferencesCopy.summary }} · {{ preferencesCopy.onCount }}</span
					></span
				>
				<span :class="styles.chevron">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="m6 9 6 6 6-6" />
					</svg>
				</span>
			</button>
			<div
				:class="expandStyles.panel"
				:id="preferencesId"
				:data-open="preferencesOpen"
				:inert="!preferencesOpen || undefined"
			>
				<div :class="expandStyles.inner">
					<div :class="styles.preferencesBody">
						<CategoryGroup
							:id-prefix="idPrefix"
							test-id-prefix="consent-banner"
							:exclude="sale ? [sale] : []"
						>
							<template #footer>
								<AdvertisingRow
									v-if="sale"
									:on="right.selected === 'allow'"
									:id-prefix="idPrefix"
								/>
							</template>
						</CategoryGroup>
					</div>
				</div>
			</div>
		</div>
	</template>
</template>
