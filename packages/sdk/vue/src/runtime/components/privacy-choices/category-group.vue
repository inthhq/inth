<script setup lang="ts">
/**
 * The cookie categories as one bordered group with inline descriptions
 * (CAT-01, CAT-06), each with its vendors (CAT-09), on a preference draft.
 * Shared by the Privacy Choices banner panels and the dialog.
 */
import {
	applyDialogCategories,
	planCategorySwitch,
	planVendorSwitch,
	vendorsListedUnder,
} from '@inth/sdk/engine';
import type {
	AllConsentNames,
	CategorySwitchPlan,
	ResolvedVendor,
	SaveUISource,
} from '@inth/sdk/engine';
import {
	consentTypes,
	resolveCategoryTitle,
	resolvePrivacyChoicesCopy,
	resolveSwitchAnnouncement,
	resolveVendorTableCopy,
} from '@inth/sdk/surface-state';
import {
	revealDisclosure,
	scheduleReveal,
} from '@inth/sdk/ui/primitives/surface';
import styles from '@inth/sdk/ui/styles/components/consent-dialog';

import '@inth/sdk/ui/styles/components/consent-expand.css';
import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';

import '@inth/sdk/ui/styles/components/consent-dialog.css';
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

import { useConsentKernel, useConsentSnapshot } from '../../composables/kernel';
import { useSurfaceTranslations } from '../../composables/use-surface-translations';
import { slotAttrs } from '../../utils/slot-attrs';
import ChoiceSwitch from './choice-switch.vue';
import { useChoiceDraft } from './draft';
import { isToggleClick, vendorOpenerKey } from './toggle-click';
import { useSurfaceSession } from './use-surface-session';
import VendorTable from './vendor-table.vue';

/**
 * How a category shows its vendors:
 *
 * - `'accordion'`: a "View N vendors" row that expands the table in place
 *   (desktop, every banner panel, the US preferences sheet).
 * - `'sheet'`: the same row opens a phone sheet (EU phone, NEST-02).
 * - `'inline'`: the table always shows (inside that sheet).
 * - `'none'`: no vendors.
 */
type VendorMode = 'accordion' | 'sheet' | 'inline' | 'none';

/**
 * One row per displayed category: its name and one-sentence description
 * inline, and a switch named by both (SR-06). `necessary` shows "Always
 * on". The switches stage into the surface's draft, or apply at once in
 * the US dialog.
 *
 * A category's switch gates its vendors (CAT-02): turning it on with no
 * vendor on turns them all on, and turning off its last vendor turns it
 * off. A vendor switch is never disabled: turning one on under an off
 * category turns the category on with only that vendor (CAT-03). Changes
 * the visitor did not press are announced (CAT-04).
 */
const props = withDefaults(
	defineProps<{
		/**
		 * Prefix for the rows' element ids, one per layer, so a switch's
		 * `aria-labelledby` never resolves into another layer (SR-05).
		 */
		idPrefix: string;
		/** The surface it renders on, which prefixes its test ids. */
		testIdPrefix: 'consent-banner' | 'consent-dialog';
		/**
		 * Categories to leave out, such as the one that decides sale in the
		 * US, which follows the rights row instead (LAW-05, CAT-08).
		 */
		exclude?: readonly AllConsentNames[];
		/** Show only this category, as a vendor sheet does (NEST-07). */
		only?: AllConsentNames;
		/**
		 * `'draft'` stages each switch until a Save (EU, every banner panel).
		 * `'immediate'` applies each switch at once, as the US dialog does
		 * (LAW-04).
		 */
		apply?: 'draft' | 'immediate';
		/** Surface to attribute an immediate change to. */
		uiSource?: SaveUISource;
		vendors?: VendorMode;
		/** The `components` part that styles the group. */
		part?: object;
		/** The `components` part that styles each vendor table. */
		vendorTablePart?: object;
	}>(),
	{
		apply: 'draft',
		exclude: () => [],
		only: undefined,
		part: undefined,
		uiSource: undefined,
		vendorTablePart: undefined,
		vendors: 'accordion',
	}
);

const emit = defineEmits<{
	/** Opens a category's vendor sheet, for `vendors: 'sheet'`. */
	'open-vendors': [category: AllConsentNames, opener: string];
	/** After an immediate change applied, for the dialog's "Saved" cue. */
	applied: [];
}>();

const kernel = useConsentKernel();
const snapshot = useConsentSnapshot();
const translations = useSurfaceTranslations();
const { session } = useSurfaceSession();
const { draft, state: draftState } = useChoiceDraft();
const openVendors = ref<Partial<Record<AllConsentNames, boolean>>>({});
const triggers = new Map<AllConsentNames, HTMLElement>();
const panels = new Map<AllConsentNames, HTMLElement>();

const rows = computed(() =>
	draftState.value.displayedCategories.filter(
		(name) =>
			!props.exclude.includes(name) &&
			(props.only === undefined || name === props.only)
	)
);
const alwaysOn = computed(
	() => resolvePrivacyChoicesCopy(translations.value).alwaysOn
);

const titleOf = (category: AllConsentNames) =>
	resolveCategoryTitle(translations.value, category);
const descriptionOf = (category: AllConsentNames) =>
	translations.value.consentTypes[category]?.description ??
	consentTypes.find((type) => type.name === category)?.description;
const vendorsOf = (category: AllConsentNames): ResolvedVendor[] =>
	props.vendors === 'none'
		? []
		: vendorsListedUnder(
				{
					model: snapshot.value.model,
					vendorChoice: snapshot.value.vendorChoice,
					vendors: snapshot.value.vendors,
				},
				category
			);
const granted = (vendor: ResolvedVendor) =>
	draftState.value.vendors[vendor.id] ?? true;
const isChecked = (category: AllConsentNames) =>
	category === 'necessary' || draftState.value.values[category] === true;

/** One row's view, from the draft and the declared vendors. */
const view = (name: AllConsentNames) => {
	const listed = vendorsOf(name);
	const checked = isChecked(name);
	const open = openVendors.value[name] === true;
	const vendorsOn = listed.filter(
		(vendor) => checked && granted(vendor)
	).length;
	return {
		checked,
		description: descriptionOf(name),
		descriptionId: `${props.idPrefix}-category-${name}-description`,
		listed,
		nameId: `${props.idPrefix}-category-${name}`,
		open,
		required: name === 'necessary',
		showTrigger:
			listed.length > 0 &&
			(props.vendors === 'accordion' || props.vendors === 'sheet'),
		tablePanelId: `${props.idPrefix}-vendors-${name}`,
		title: titleOf(name),
		trigger: resolveVendorTableCopy(translations.value, {
			category: titleOf(name),
			count: listed.length,
			onCount: vendorsOn,
			open,
		}),
	};
};

/** Stage a plan, apply it in the US dialog, and announce it. */
const commit = (
	category: AllConsentNames,
	plan: CategorySwitchPlan,
	changes: { name: string; on: boolean }[]
) => {
	draft.set(category, plan.on);
	for (const [id, value] of Object.entries(plan.vendors)) {
		draft.setVendor(id, value);
	}
	const applied = props.apply === 'immediate';
	if (applied) {
		void applyDialogCategories(kernel, draft, [category], {
			uiSource: props.uiSource,
		});
		emit('applied');
	}
	if (applied || changes.length > 1) {
		session.announce(
			resolveSwitchAnnouncement(translations.value, { applied, changes })
		);
	}
};

const stateOf = (category: AllConsentNames, listed: ResolvedVendor[]) => ({
	on: draftState.value.values[category] === true,
	vendors: Object.fromEntries(
		listed
			.filter((vendor) => vendor.disabled !== true)
			.map((vendor) => [vendor.id, granted(vendor)])
	),
});

const toggleCategory = (category: AllConsentNames, on: boolean) => {
	const plan = planCategorySwitch(stateOf(category, vendorsOf(category)), on);
	commit(category, plan, [{ name: titleOf(category), on }]);
};

const toggleVendor = (
	category: AllConsentNames,
	vendor: ResolvedVendor,
	on: boolean
) => {
	const plan = planVendorSwitch(
		stateOf(category, vendorsOf(category)),
		vendor.id,
		on
	);
	const changes = [{ name: vendor.name ?? vendor.id, on }];
	if (plan.categoryChanged) {
		changes.push({ name: titleOf(category), on: plan.on });
	}
	commit(category, plan, changes);
};

const onRowClick = (event: MouseEvent, name: AllConsentNames) => {
	if (name !== 'necessary' && isToggleClick(event)) {
		toggleCategory(name, !isChecked(name));
	}
};

let cancelReveal: (() => void) | undefined;
let unmounted = false;
// A reveal still waiting for its frames scrolls nothing once the group is
// gone (LAY-05).
onBeforeUnmount(() => {
	unmounted = true;
	cancelReveal?.();
	cancelReveal = undefined;
});
const onTrigger = async (name: AllConsentNames) => {
	if (props.vendors === 'sheet') {
		emit('open-vendors', name, vendorOpenerKey(name));
		return;
	}
	const opening = openVendors.value[name] !== true;
	openVendors.value = { ...openVendors.value, [name]: opening };
	if (!opening) {
		return;
	}
	// Bring the opened table into view without scrolling its trigger out
	// (LAY-05), unless the surface moved on (PERM-16).
	await nextTick();
	cancelReveal?.();
	if (unmounted) {
		return;
	}
	const { token } = session.getState();
	cancelReveal = scheduleReveal(
		() => {
			const trigger = triggers.get(name);
			const panel = panels.get(name);
			if (trigger && panel) {
				revealDisclosure(trigger, panel);
			}
		},
		{ isCurrent: () => session.isCurrent(token) }
	);
};

const keepElement =
	(map: Map<AllConsentNames, HTMLElement>, name: AllConsentNames) =>
	(element: unknown) => {
		if (element) {
			map.set(name, element as HTMLElement);
		} else {
			map.delete(name);
		}
	};
</script>

<template>
	<div
		v-bind="slotAttrs(part, expandStyles.group)"
		:data-testid="`${testIdPrefix}-category-group`"
	>
		<template
			v-for="row in rows.map((name) => ({ name, ...view(name) }))"
			:key="row.name"
		>
			<div
				:class="styles.category"
				:data-category="row.name"
			>
				<!-- A pointer shortcut like a label's; the switch stays the only keyboard and focus target (CAT-10). -->
				<div
					:class="styles.categoryRow"
					:data-row-toggle="row.required ? undefined : ''"
					@click="onRowClick($event, row.name)"
				>
					<div :class="styles.categoryText">
						<span
							:class="styles.categoryName"
							:id="row.nameId"
						>
							{{ row.title }}
						</span>
						<span
							v-if="row.description"
							:class="styles.categoryDescription"
							:id="row.descriptionId"
						>
							{{ row.description }}
						</span>
					</div>
					<span
						v-if="row.required"
						:class="styles.categoryState"
					>
						{{ alwaysOn }}
					</span>
					<ChoiceSwitch
						v-else
						:checked="row.checked"
						:aria-labelledby="row.nameId"
						:aria-describedby="row.description ? row.descriptionId : undefined"
						:data-testid="`${testIdPrefix}-category-switch-${row.name}`"
						@change="(next: boolean) => toggleCategory(row.name, next)"
					/>
				</div>
				<button
					v-if="row.showTrigger"
					:ref="keepElement(triggers, row.name)"
					type="button"
					:class="styles.vendorTrigger"
					:aria-expanded="vendors === 'accordion' ? row.open : undefined"
					:aria-controls="
						vendors === 'accordion' ? row.tablePanelId : undefined
					"
					:aria-haspopup="vendors === 'sheet' ? 'dialog' : undefined"
					:data-opener="vendorOpenerKey(row.name)"
					:data-testid="`${testIdPrefix}-vendor-trigger-${row.name}`"
					@click="onTrigger(row.name)"
				>
					<!-- The name starts with the visible text (CAT-05). -->
					<span
						>{{ row.trigger.trigger
						}}<span :class="styles.visuallyHidden">{{
							` ${row.trigger.triggerSuffix}`
						}}</span></span
					>
					<span :class="styles.vendorMeta"
						>{{ row.trigger.onCount
						}}<span
							:class="styles.chevron"
							:data-direction="vendors === 'sheet' ? 'end' : 'down'"
							><svg
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
								<path
									:d="vendors === 'sheet' ? 'm9 6 6 6-6 6' : 'm6 9 6 6 6-6'"
								/></svg></span
					></span>
				</button>
				<div
					v-if="vendors === 'accordion' && row.listed.length > 0"
					:ref="keepElement(panels, row.name)"
					:class="styles.disclosure"
					:id="row.tablePanelId"
					:data-open="row.open"
					:inert="!row.open || undefined"
				>
					<div :class="styles.disclosureInner">
						<VendorTable
							:category="row.name"
							:category-title="row.title"
							:id-prefix="idPrefix"
							:vendors="row.listed"
							:shown="(vendor) => row.checked && granted(vendor)"
							:surface="testIdPrefix"
							:part="vendorTablePart"
							@toggle="(vendor, on) => toggleVendor(row.name, vendor, on)"
						/>
					</div>
				</div>
				<VendorTable
					v-if="vendors === 'inline' && row.listed.length > 0"
					:category="row.name"
					:category-title="row.title"
					:id-prefix="idPrefix"
					:vendors="row.listed"
					:shown="(vendor) => row.checked && granted(vendor)"
					:surface="testIdPrefix"
					:part="vendorTablePart"
					@toggle="(vendor, on) => toggleVendor(row.name, vendor, on)"
				/>
			</div>
		</template>
		<!-- A row after the categories, such as the read-only advertising row. -->
		<slot name="footer" />
	</div>
</template>
