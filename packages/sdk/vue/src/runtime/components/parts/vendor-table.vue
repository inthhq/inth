<script setup lang="ts">
/*
 * The vendor table lays out as a CSS grid of 40px lines; ARIA table roles
 * keep its table semantics, which some engines drop from a <table>
 * restyled as a grid.
 */
import type { AllConsentNames, ResolvedVendor } from '@inth/sdk/engine';
import { resolveVendorTableCopy } from '@inth/sdk/surface-state';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import '@inth/sdk/ui/styles/components/consent-dialog.css';
import { computed } from 'vue';

import { useSurfaceTranslations } from '../../composables/use-surface-translations';
import { slotAttrs } from '../../utils/slot-attrs';
import ChoiceSwitch from './choice-switch.vue';
import { isToggleClick } from './toggle-click';

/**
 * A category's vendors as a boxed table (CAT-09): one 40px line each, the
 * purpose cut off with its full text on hover, a privacy policy link named
 * for the vendor (CAT-07), and a small switch that is never disabled
 * (CAT-03).
 */
const props = defineProps<{
	category: AllConsentNames;
	categoryTitle: string;
	idPrefix: string;
	vendors: readonly ResolvedVendor[];
	/** Each vendor's switch, as shown: on only while its category is on. */
	shown: (vendor: ResolvedVendor) => boolean;
	surface: 'consent-banner' | 'consent-dialog';
	/** The `components` part that styles the table. */
	part?: object;
}>();

const emit = defineEmits<{
	toggle: [vendor: ResolvedVendor, granted: boolean];
}>();

const translations = useSurfaceTranslations();
const copy = computed(() =>
	resolveVendorTableCopy(translations.value, {
		category: props.categoryTitle,
		count: props.vendors.length,
		onCount: 0,
		open: true,
	})
);
const nameId = (vendor: ResolvedVendor) =>
	`${props.idPrefix}-vendor-${props.category}-${vendor.id}`;
const onRowClick = (event: MouseEvent, vendor: ResolvedVendor) => {
	if (vendor.disabled !== true && isToggleClick(event)) {
		emit('toggle', vendor, !props.shown(vendor));
	}
};
</script>

<template>
	<div
		v-bind="slotAttrs(part, styles.vendorTable)"
		role="table"
		:aria-label="copy.table"
		:data-testid="`${surface}-vendor-table-${category}`"
	>
		<div
			:class="styles.vendorHead"
			role="row"
		>
			<span role="columnheader">{{ copy.vendorColumn }}</span>
			<span role="columnheader">{{ copy.purposeColumn }}</span>
			<span role="columnheader">
				<span :class="styles.visuallyHidden">{{ copy.policyColumn }}</span>
			</span>
			<span role="columnheader">
				<span :class="styles.visuallyHidden">{{ copy.switchColumn }}</span>
			</span>
		</div>
		<!-- A pointer shortcut like a label's; the switch stays the only keyboard and focus target (CAT-10). -->
		<div
			v-for="vendor in vendors"
			:key="vendor.id"
			:class="styles.vendorRow"
			role="row"
			:data-row-toggle="vendor.disabled !== true ? '' : undefined"
			@click="onRowClick($event, vendor)"
		>
			<span
				:class="styles.vendorName"
				role="cell"
				:id="nameId(vendor)"
			>
				{{ vendor.name ?? vendor.id }}
			</span>
			<span
				:class="styles.vendorPurpose"
				role="cell"
				:id="`${nameId(vendor)}-purpose`"
				:title="vendor.description"
			>
				{{ vendor.description }}
			</span>
			<span role="cell">
				<a
					v-if="vendor.privacyPolicyUrl"
					:class="styles.vendorLink"
					:href="vendor.privacyPolicyUrl"
					target="_blank"
					rel="noopener noreferrer"
					:aria-label="copy.policyLink(vendor.name ?? vendor.id)"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path
							d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"
						/>
					</svg>
				</a>
			</span>
			<span role="cell">
				<ChoiceSwitch
					v-if="vendor.disabled !== true"
					:checked="shown(vendor)"
					size="small"
					:aria-labelledby="nameId(vendor)"
					:aria-describedby="
						vendor.description ? `${nameId(vendor)}-purpose` : undefined
					"
					:data-testid="`${surface}-vendor-switch-${category}-${vendor.id}`"
					@change="(next: boolean) => emit('toggle', vendor, next)"
				/>
			</span>
		</div>
	</div>
</template>
