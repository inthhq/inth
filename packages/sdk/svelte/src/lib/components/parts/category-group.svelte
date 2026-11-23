<script
	lang="ts"
	module
>
	import type { AllConsentNames } from '@inth/sdk/engine';

	/** Surfaces that render the category group, by their test-id prefix. */
	export type CategoryGroupSurface = 'consent-banner' | 'consent-dialog';

	/**
	 * How a category shows its vendors:
	 *
	 * - `'accordion'`: a "View N vendors" row that expands the table in place
	 *   (desktop, every banner panel, the US preferences sheet).
	 * - `'sheet'`: the same row opens a phone sheet (EU phone, NEST-02).
	 * - `'inline'`: the table always shows (inside that sheet).
	 * - `'none'`: no vendors.
	 */
	export type VendorMode = 'accordion' | 'sheet' | 'inline' | 'none';

	/**
	 * The group's test ids on each surface, spelled out so each one matches
	 * `internals/conformance/src/contract/test-ids.ts`. A switch's id is the
	 * prefix plus its category; a vendor switch's, the prefix plus
	 * `<category>-<vendor id>`.
	 */
	const GROUP_TEST_IDS = {
		'consent-banner': {
			group: 'consent-banner-category-group',
			switchPrefix: 'consent-banner-category-switch-',
			vendorSwitchPrefix: 'consent-banner-vendor-switch-',
			vendorTablePrefix: 'consent-banner-vendor-table-',
			vendorTriggerPrefix: 'consent-banner-vendor-trigger-',
		},
		'consent-dialog': {
			group: 'consent-dialog-category-group',
			switchPrefix: 'consent-dialog-category-switch-',
			vendorSwitchPrefix: 'consent-dialog-vendor-switch-',
			vendorTablePrefix: 'consent-dialog-vendor-table-',
			vendorTriggerPrefix: 'consent-dialog-vendor-trigger-',
		},
	} as const satisfies Record<CategoryGroupSurface, Record<string, string>>;

	/** The opener key for a category's vendor trigger, where focus returns (NEST-04). */
	export const vendorOpenerKey = (category: AllConsentNames): string =>
		`vendors:${category}`;

	/**
	 * Whether a click on a row's text should toggle its switch (CAT-10): not
	 * on a link or control, nor while the visitor selected text.
	 */
	const isToggleClick = function isToggleClick(
		event: MouseEvent & { currentTarget: HTMLElement }
	): boolean {
		const target = event.target as Element | null;
		if (target?.closest('a, button, input')) {
			return false;
		}
		const selection = event.currentTarget.ownerDocument.getSelection();
		return !selection || selection.isCollapsed;
	};

	const NO_CATEGORIES: readonly AllConsentNames[] = [];
</script>

<script lang="ts">
	/**
	 * The cookie categories as one bordered group with inline descriptions
	 * (CAT-01, CAT-06), each with its vendors (CAT-09), on the surface's
	 * draft. One row per displayed category: its name and one-sentence
	 * description inline, and a switch named by both (SR-06). `necessary`
	 * shows "Always on". The switches stage into the draft, or apply at
	 * once in the US dialog.
	 *
	 * A category's switch gates its vendors (CAT-02): turning it on with no
	 * vendor on turns them all on, and turning off its last vendor turns it
	 * off. A vendor switch is never disabled: turning one on under an off
	 * category turns the category on with only that vendor (CAT-03). Changes
	 * the visitor did not press are announced (CAT-04).
	 */
	import {
		applyDialogCategories,
		planCategorySwitch,
		planVendorSwitch,
		vendorsListedUnder,
	} from '@inth/sdk/engine';
	import type {
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
	import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
	import type { AllThemeKeys } from '@inth/sdk/ui/theme';
	import type { Snippet } from 'svelte';
	import { tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	import {
		getConsentContext,
		getThemeContext,
	} from '../../get-consent-context.svelte';
	import ChoiceSwitch from './choice-switch.svelte';
	import { getSurfaceDraft } from './create-surface-draft.svelte';
	import Icon from './icon.svelte';
	import { cx, part } from './surface-parts.model';
	import { useSurfaceSession } from './use-surface-session.svelte';

	let {
		idPrefix,
		testIdPrefix,
		exclude = NO_CATEGORIES,
		only,
		footer,
		noStyle = false,
		apply = 'draft',
		uiSource,
		vendors: vendorMode = 'accordion',
		onOpenVendors,
		onApplied,
		themeKey,
		vendorTableThemeKey,
	}: {
		/**
		 * Prefix for the rows' element ids, one per layer, so a switch's
		 * `aria-labelledby` never resolves into another layer (SR-05).
		 */
		idPrefix: string;
		/** The surface it renders on, which prefixes its test ids. */
		testIdPrefix: CategoryGroupSurface;
		/**
		 * Categories to leave out, such as the one that decides sale in the
		 * US, which follows the rights row instead (LAW-05, CAT-08).
		 */
		exclude?: readonly AllConsentNames[];
		/** Show only this category, as a vendor sheet does (NEST-07). */
		only?: AllConsentNames;
		/** A row after the categories, such as the read-only advertising row. */
		footer?: Snippet;
		noStyle?: boolean;
		/**
		 * `'draft'` stages each switch until a Save (EU, every banner panel).
		 * `'immediate'` applies each switch at once, as the US dialog does
		 * (LAW-04).
		 */
		apply?: 'draft' | 'immediate';
		/** Surface to attribute an immediate change to. */
		uiSource?: SaveUISource;
		vendors?: VendorMode;
		/** Opens a category's vendor sheet, for `vendors: 'sheet'`. */
		onOpenVendors?: (category: AllConsentNames, opener: string) => void;
		/** Called after an immediate change applied, for the dialog's "Saved" cue. */
		onApplied?: () => void;
		/** The `theme.slots` key that styles the group. */
		themeKey?: AllThemeKeys;
		/** The `theme.slots` key that styles each vendor table. */
		vendorTableThemeKey?: AllThemeKeys;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();
	const surface = useSurfaceSession();
	const surfaceDraft = getSurfaceDraft();

	const translations = $derived(consent.state.copy);
	const draftState = $derived(surfaceDraft.state);
	const displayed = $derived(draftState?.displayedCategories ?? []);
	const values: Partial<Record<AllConsentNames, boolean>> = $derived(
		draftState?.values ?? {}
	);
	const grants: Readonly<Record<string, boolean>> = $derived(
		draftState?.vendors ?? {}
	);
	const testIds = $derived(GROUP_TEST_IDS[testIdPrefix]);
	const rows = $derived(
		displayed.filter(
			(name) => !exclude.includes(name) && (only === undefined || name === only)
		)
	);
	const alwaysOn = $derived(resolvePrivacyChoicesCopy(translations).alwaysOn);
	const groupPart = $derived(
		part(themeKey, theme.theme, expandStyles.group, noStyle)
	);
	const tablePart = $derived(
		part(vendorTableThemeKey, theme.theme, styles.vendorTable, noStyle)
	);

	const openVendors = new SvelteMap<AllConsentNames, boolean>();
	const triggers: Partial<Record<AllConsentNames, HTMLButtonElement>> = $state(
		{}
	);
	const panels: Partial<Record<AllConsentNames, HTMLDivElement>> = $state({});

	const vendorsOf = (category: AllConsentNames): ResolvedVendor[] =>
		vendorMode === 'none' ? [] : vendorsListedUnder(consent.snapshot, category);
	const titleOf = (category: AllConsentNames) =>
		resolveCategoryTitle(translations, category);
	const granted = (vendor: ResolvedVendor) => grants[vendor.id] ?? true;
	const descriptionOf = (name: AllConsentNames) =>
		translations.consentTypes[name]?.description ??
		consentTypes.find((type) => type.name === name)?.description;

	/** Stage a plan, apply it in the US dialog, and announce it. */
	const commit = function commit(
		category: AllConsentNames,
		plan: CategorySwitchPlan,
		changes: { name: string; on: boolean }[]
	) {
		const { draft } = surfaceDraft;
		if (!draft) {
			return;
		}
		draft.set(category, plan.on);
		for (const [id, value] of Object.entries(plan.vendors)) {
			draft.setVendor(id, value);
		}
		const applied = apply === 'immediate';
		if (applied) {
			void applyDialogCategories(consent.kernel, draft, [category], {
				uiSource,
			});
			onApplied?.();
		}
		if (applied || changes.length > 1) {
			surface.session.announce(
				resolveSwitchAnnouncement(translations, { applied, changes })
			);
		}
	};

	const stateOf = (category: AllConsentNames, listed: ResolvedVendor[]) => ({
		on: values[category] === true,
		vendors: Object.fromEntries(
			listed
				.filter((vendor) => vendor.disabled !== true)
				.map((vendor) => [vendor.id, granted(vendor)])
		),
	});

	const toggleCategory = function toggleCategory(
		category: AllConsentNames,
		listed: ResolvedVendor[],
		on: boolean
	) {
		const plan = planCategorySwitch(stateOf(category, listed), on);
		commit(category, plan, [{ name: titleOf(category), on }]);
	};

	const toggleVendor = function toggleVendor(
		category: AllConsentNames,
		listed: ResolvedVendor[],
		vendor: ResolvedVendor,
		on: boolean
	) {
		const plan = planVendorSwitch(stateOf(category, listed), vendor.id, on);
		const changes = [{ name: vendor.name ?? vendor.id, on }];
		if (plan.categoryChanged) {
			changes.push({ name: titleOf(category), on: plan.on });
		}
		commit(category, plan, changes);
	};

	/**
	 * Bring an opened vendor table into view without scrolling its trigger
	 * out (LAY-05), unless the surface moved on (PERM-16).
	 */
	let cancelReveal: (() => void) | undefined;
	let destroyed = false;
	const reveal = async function reveal(category: AllConsentNames) {
		await tick();
		cancelReveal?.();
		cancelReveal = undefined;
		// Unmounted while the table rendered: nothing is left to reveal, and
		// a reveal scheduled now would outlive the component.
		if (destroyed) {
			return;
		}
		const { session } = surface;
		const { token } = session.getState();
		cancelReveal = scheduleReveal(
			() => {
				const trigger = triggers[category];
				const panel = panels[category];
				if (trigger && panel) {
					revealDisclosure(trigger, panel);
				}
			},
			{ isCurrent: () => session.isCurrent(token) }
		);
	};
	$effect(() => () => {
		destroyed = true;
		cancelReveal?.();
	});

	const onTrigger = function onTrigger(category: AllConsentNames) {
		if (vendorMode === 'sheet') {
			onOpenVendors?.(category, vendorOpenerKey(category));
			return;
		}
		const open = openVendors.get(category) === true;
		openVendors.set(category, !open);
		if (!open) {
			void reveal(category);
		}
	};
</script>

{#snippet vendorTable(
	category: AllConsentNames,
	listed: ResolvedVendor[],
	checked: boolean
)}
	{@const copy = resolveVendorTableCopy(translations, {
		category: titleOf(category),
		count: listed.length,
		onCount: 0,
		open: true,
	})}
	<!-- The vendor table lays out as a CSS grid of 40px lines; ARIA table
	     roles keep its table semantics, which some engines drop from a
	     <table> restyled as a grid. -->
	<div
		class={tablePart.class}
		style={tablePart.style}
		role="table"
		aria-label={copy.table}
		data-testid={testIds.vendorTablePrefix + category}
	>
		<div
			class={cx(noStyle, styles.vendorHead)}
			role="row"
		>
			<span role="columnheader">{copy.vendorColumn}</span>
			<span role="columnheader">{copy.purposeColumn}</span>
			<span role="columnheader">
				<span class={cx(noStyle, styles.visuallyHidden)}>
					{copy.policyColumn}
				</span>
			</span>
			<span role="columnheader">
				<span class={cx(noStyle, styles.visuallyHidden)}>
					{copy.switchColumn}
				</span>
			</span>
		</div>
		{#each listed as vendor (vendor.id)}
			{@const name = vendor.name ?? vendor.id}
			{@const nameId = `${idPrefix}-vendor-${category}-${vendor.id}`}
			{@const purposeId = `${nameId}-purpose`}
			{@const toggleable = vendor.disabled !== true}
			{@const on = checked && granted(vendor)}
			<!-- A pointer shortcut like a label's; the switch stays the only
			     keyboard and focus target (CAT-10). -->
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
			<div
				class={cx(noStyle, styles.vendorRow)}
				role="row"
				data-row-toggle={toggleable ? '' : undefined}
				onclick={(event) => {
					if (toggleable && isToggleClick(event)) {
						toggleVendor(category, listed, vendor, !on);
					}
				}}
			>
				<span
					class={cx(noStyle, styles.vendorName)}
					role="cell"
					id={nameId}
				>
					{name}
				</span>
				<span
					class={cx(noStyle, styles.vendorPurpose)}
					role="cell"
					id={purposeId}
					title={vendor.description}
				>
					{vendor.description}
				</span>
				<span role="cell">
					{#if vendor.privacyPolicyUrl}
						<a
							class={cx(noStyle, styles.vendorLink)}
							href={vendor.privacyPolicyUrl}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={copy.policyLink(name)}
						>
							<Icon
								name="external"
								size={13}
							/>
						</a>
					{/if}
				</span>
				<span role="cell">
					{#if toggleable}
						<ChoiceSwitch
							checked={on}
							size="small"
							{noStyle}
							labelledby={nameId}
							describedby={vendor.description ? purposeId : undefined}
							testId={`${testIds.vendorSwitchPrefix}${category}-${vendor.id}`}
							onCheckedChange={(next) =>
								toggleVendor(category, listed, vendor, next)}
						/>
					{/if}
				</span>
			</div>
		{/each}
	</div>
{/snippet}

<div
	class={groupPart.class}
	style={groupPart.style}
	data-testid={testIds.group}
>
	{#each rows as name (name)}
		{@const nameId = `${idPrefix}-category-${name}`}
		{@const descriptionId = `${nameId}-description`}
		{@const required = name === 'necessary'}
		{@const checked = required || values[name] === true}
		{@const description = descriptionOf(name)}
		{@const listed = vendorsOf(name)}
		{@const vendorsOn = listed.filter(
			(vendor) => checked && granted(vendor)
		).length}
		{@const open = openVendors.get(name) === true}
		{@const tablePanelId = `${idPrefix}-vendors-${name}`}
		{@const triggerCopy = resolveVendorTableCopy(translations, {
			category: titleOf(name),
			count: listed.length,
			onCount: vendorsOn,
			open,
		})}
		{@const showTrigger =
			listed.length > 0 &&
			(vendorMode === 'accordion' || vendorMode === 'sheet')}
		<div
			class={cx(noStyle, styles.category)}
			data-category={name}
		>
			<!-- A pointer shortcut like a label's; the switch stays the only
			     keyboard and focus target (CAT-10). -->
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
			<div
				class={cx(noStyle, styles.categoryRow)}
				data-row-toggle={required ? undefined : ''}
				onclick={(event) => {
					if (!required && isToggleClick(event)) {
						toggleCategory(name, listed, !checked);
					}
				}}
			>
				<div class={cx(noStyle, styles.categoryText)}>
					<span
						class={cx(noStyle, styles.categoryName)}
						id={nameId}
					>
						{titleOf(name)}
					</span>
					{#if description}
						<span
							class={cx(noStyle, styles.categoryDescription)}
							id={descriptionId}
						>
							{description}
						</span>
					{/if}
				</div>
				{#if required}
					<span class={cx(noStyle, styles.categoryState)}>{alwaysOn}</span>
				{:else}
					<ChoiceSwitch
						{checked}
						{noStyle}
						labelledby={nameId}
						describedby={description ? descriptionId : undefined}
						testId={testIds.switchPrefix + name}
						onCheckedChange={(next) => toggleCategory(name, listed, next)}
					/>
				{/if}
			</div>
			{#if showTrigger}
				<button
					bind:this={triggers[name]}
					type="button"
					class={cx(noStyle, styles.vendorTrigger)}
					aria-expanded={vendorMode === 'accordion' ? open : undefined}
					aria-controls={vendorMode === 'accordion' ? tablePanelId : undefined}
					aria-haspopup={vendorMode === 'sheet' ? 'dialog' : undefined}
					data-opener={vendorOpenerKey(name)}
					data-testid={testIds.vendorTriggerPrefix + name}
					onclick={() => onTrigger(name)}
				>
					<!-- The name starts with the visible text (CAT-05). -->
					<span>
						{triggerCopy.trigger}<span
							class={cx(noStyle, styles.visuallyHidden)}
							>{` ${triggerCopy.triggerSuffix}`}</span
						>
					</span>
					<span class={cx(noStyle, styles.vendorMeta)}>
						{triggerCopy.onCount}
						<!-- A sheet comes in from the end; an accordion opens downwards. -->
						<span
							class={cx(noStyle, styles.chevron)}
							data-direction={vendorMode === 'sheet' ? 'end' : 'down'}
						>
							<Icon
								name={vendorMode === 'sheet' ? 'chevron-end' : 'chevron-down'}
							/>
						</span>
					</span>
				</button>
			{/if}
			{#if vendorMode === 'accordion' && listed.length > 0}
				<div
					bind:this={panels[name]}
					class={cx(noStyle, styles.disclosure)}
					id={tablePanelId}
					data-open={open}
					inert={!open}
				>
					<div class={cx(noStyle, styles.disclosureInner)}>
						{@render vendorTable(name, listed, checked)}
					</div>
				</div>
			{/if}
			{#if vendorMode === 'inline' && listed.length > 0}
				{@render vendorTable(name, listed, checked)}
			{/if}
		</div>
	{/each}
	{@render footer?.()}
</div>
