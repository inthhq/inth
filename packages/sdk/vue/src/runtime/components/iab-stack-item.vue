<script setup lang="ts">
import { countIABPartners } from '@inth/sdk/iab/headless';
import type { IABLegitimateInterestState } from '@inth/sdk/iab/headless';

import '@inth/sdk/ui/styles/components/iab-consent-dialog.css';
import dialogStyles from '@inth/sdk/ui/styles/components/iab-consent-dialog';

import '@inth/sdk/ui/styles/components/switch.css';
/**
 * A TCF stack: one toggle standing for the purposes it absorbed.
 *
 * Built on the same `PreferenceItem` primitive as the purpose rows, so the
 * purposes it nests stay in the DOM while it is closed — which is what
 * lets the four adapters be compared row for row.
 */
import switchStyles from '@inth/sdk/ui/styles/components/switch';
import { computed, ref, toValue } from 'vue';

import {
	useConsentConfig,
	useConsentInit,
	useIabTranslations,
} from '#inth/composables';

import {
	PreferenceItemContent,
	PreferenceItemControl,
	PreferenceItemHeader,
	PreferenceItemLeading,
	PreferenceItemMeta,
	PreferenceItemRoot,
	PreferenceItemTitle,
	PreferenceItemTrigger,
	SwitchRoot,
	SwitchThumb,
} from '../primitives';
import { slotAttrs } from '../utils/slot-attrs';
import type { IabProcessedPurpose, IabVendorId } from './iab-purpose-item.vue';
import IabPurposeItem from './iab-purpose-item.vue';
import ChevronRightIcon from './icons/chevron-right-icon.vue';

export interface IabProcessedStack {
	id: number;
	name: string;
	description: string;
	purposes: IabProcessedPurpose[];
}

const props = defineProps<{
	stack: IabProcessedStack;
	consents: Record<number, boolean>;
	vendorConsents: Record<string, boolean>;
	/** Draft and vendor list the legitimate interest controls read. */
	legitimateInterests?: IABLegitimateInterestState | null;
}>();

const emit = defineEmits<{
	toggle: [purposeId: number, value: boolean];
	vendorToggle: [vendorId: IabVendorId, value: boolean];
	vendorClick: [vendorId: IabVendorId];
	purposeObjection: [purposeId: number, objected: boolean];
	vendorLegitimateInterestToggle: [vendorId: IabVendorId, value: boolean];
}>();

const isExpanded = ref(false);
const config = useConsentConfig();
const init = useConsentInit();

const iabT = useIabTranslations();

// The stack switch covers the purposes some vendor processes on consent.
// The others offer only their own objection control.
const consentPurposes = computed(() =>
	props.stack.purposes.filter((purpose) => purpose.hasConsentBasis !== false)
);

const allEnabled = computed(() =>
	consentPurposes.value.every((purpose) => props.consents[purpose.id] ?? false)
);

const someEnabled = computed(
	() =>
		consentPurposes.value.some(
			(purpose) => props.consents[purpose.id] ?? false
		) && !allEnabled.value
);

const totalVendors = computed(() => countIABPartners(props.stack.purposes));

const partnerLabel = computed(() =>
	totalVendors.value === 1
		? iabT.value?.preferenceCenter?.vendorList?.partnerSingular
		: iabT.value?.preferenceCenter?.vendorList?.partnerPlural
);

const stackChecked = computed({
	get: () => allEnabled.value,
	set: (value: boolean) => {
		for (const purpose of consentPurposes.value) {
			emit('toggle', purpose.id, value);
			for (const vendor of purpose.vendors) {
				if (!vendor.usesLegitimateInterest) {
					emit('vendorToggle', vendor.id, value);
				}
			}
		}
	},
});
</script>

<template>
	<PreferenceItemRoot
		v-model:open="isExpanded"
		v-bind="config.components?.['iab-stack-item']?.root"
		:class="dialogStyles.stackItem"
		:data-testid="`stack-item-${stack.id}`"
		no-style
	>
		<div
			v-bind="config.components?.['iab-stack-item']?.header"
			:class="dialogStyles.stackHeader"
		>
			<PreferenceItemTrigger
				v-bind="config.components?.['iab-stack-item']?.trigger"
				:class="dialogStyles.stackTrigger"
			>
				<PreferenceItemLeading>
					<ChevronRightIcon
						:class="dialogStyles.purposeArrow"
						:expanded="isExpanded"
					/>
				</PreferenceItemLeading>
				<PreferenceItemHeader :class="dialogStyles.stackInfo">
					<PreferenceItemTitle :class="dialogStyles.stackName">
						{{ stack.name }}
					</PreferenceItemTitle>
					<PreferenceItemMeta :class="dialogStyles.stackMeta">
						{{ totalVendors }} {{ partnerLabel }}
					</PreferenceItemMeta>
				</PreferenceItemHeader>
			</PreferenceItemTrigger>
			<PreferenceItemControl :class="dialogStyles.stackControls">
				<template v-if="someEnabled">
					<span :class="dialogStyles.srOnly">Partially enabled</span>
					<div :class="dialogStyles.partialIndicator" />
				</template>
				<SwitchRoot
					v-if="consentPurposes.length > 0"
					v-model="stackChecked"
					v-bind="slotAttrs(config.components?.switch?.root, switchStyles.root)"
					:aria-label="stack.name"
					data-size="medium"
				>
					<span
						v-bind="config.components?.switch?.track"
						data-slot="switch-track"
						:class="switchStyles.track"
					>
						<SwitchThumb
							v-bind="config.components?.switch?.thumb"
							:class="switchStyles.thumb"
						/>
					</span>
				</SwitchRoot>
			</PreferenceItemControl>
		</div>

		<PreferenceItemContent :no-style="false">
			<div :class="dialogStyles.stackDescription">
				<p>{{ stack.description }}</p>
			</div>
			<div
				v-bind="config.components?.['iab-stack-item']?.content"
				:class="dialogStyles.stackContent"
			>
				<IabPurposeItem
					v-for="purpose in stack.purposes"
					:key="purpose.id"
					:purpose="purpose"
					:is-enabled="consents[purpose.id] ?? false"
					:vendor-consents="vendorConsents"
					:legitimate-interests="legitimateInterests"
					@toggle="(value) => emit('toggle', purpose.id, value)"
					@vendor-toggle="
						(vendorId, value) => emit('vendorToggle', vendorId, value)
					"
					@vendor-click="(vendorId) => emit('vendorClick', vendorId)"
					@vendor-legitimate-interest-toggle="
						(vendorId, value) =>
							emit('vendorLegitimateInterestToggle', vendorId, value)
					"
					@purpose-objection="
						(objected) => emit('purposeObjection', purpose.id, objected)
					"
				/>
			</div>
		</PreferenceItemContent>
	</PreferenceItemRoot>
</template>
