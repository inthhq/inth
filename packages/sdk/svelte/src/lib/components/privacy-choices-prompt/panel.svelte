<script lang="ts">
	/**
	 * The options a Privacy Choices prompt shows in place (BNR-14, BNR-15):
	 *
	 * - EU: the cookie categories, staged on the prompt's draft until a
	 *   Save, Accept or Reject.
	 * - US opt-in: the rights row, which applies as in the dialog, then
	 *   Preferences.
	 * - US notice: the rights row, which applies at once (LAW-04).
	 *
	 * Banner panels always use accordions, never sheets (PERM-01). Loaded on
	 * Customize, or at once by a side Drawer, with the stylesheets and the
	 * draft module they need. The v6 sheet carries its own switch and
	 * category rows, so the classic dialog sheet stays off the page.
	 */
	import { resolveSaleRight } from '@inth/sdk/engine';
	import type { SaveUISource } from '@inth/sdk/engine';
	import { createPreferenceDraft } from '@inth/sdk/preference-draft';
	import { resolvePreferencesRowCopy } from '@inth/sdk/surface-state';
	import type { PrivacyChoicesPromptVariant } from '@inth/sdk/surface-state';
	import styles from '@inth/sdk/ui/styles/components/consent-dialog';
	import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
	import * as privacyChoicesDialog from '@inth/sdk/ui/styles/sheets/dialog';
	import * as expand from '@inth/sdk/ui/styles/sheets/expand';
	import { onMount } from 'svelte';

	import { getConsentContext } from '../../context.svelte';
	import type { SurfaceStyleSheet } from '../../surface-styles';
	import AdvertisingRow from '../privacy-choices/advertising-row.svelte';
	import CategoryGroup from '../privacy-choices/category-group.svelte';
	import { getSurfaceDraft } from '../privacy-choices/draft.svelte';
	import Icon from '../privacy-choices/icon.svelte';
	import { cx } from '../privacy-choices/parts';
	import SaleRightsRow from '../privacy-choices/rights-row.svelte';
	import SurfaceStyles from '../surface-styles.svelte';

	/** The options' rules: the in-place panel, then the v6 rows over it. */
	const PANEL_SHEETS: readonly SurfaceStyleSheet[] = [
		expand,
		privacyChoicesDialog,
	];

	let {
		variant,
		idPrefix,
		uiSource,
		noStyle = false,
		onReady,
	}: {
		variant: PrivacyChoicesPromptVariant;
		/** Prefix for element ids inside the panel (SR-05). */
		idPrefix: string;
		uiSource?: SaveUISource;
		noStyle?: boolean;
		/** Called once the options render, so the prompt can focus the first one. */
		onReady?: () => void;
	} = $props();

	const consent = getConsentContext();
	const surfaceDraft = getSurfaceDraft();
	// The draft renders seeded values from the panel's first render.
	surfaceDraft.provide(createPreferenceDraft);

	onMount(() => {
		onReady?.();
	});

	// Preferences in a US panel: the cookie categories behind a disclosure.
	// The category that decides sale follows the rights row instead of
	// having a switch of its own (LAW-05, CAT-08).
	const right = $derived(resolveSaleRight(consent.snapshot));
	const sale = $derived(right.available ? right.category : null);
	const saleOn = $derived(right.selected === 'allow');
	const onCount = $derived(
		(surfaceDraft.state?.displayedCategories ?? []).filter(
			(name) =>
				name !== 'necessary' &&
				name !== sale &&
				surfaceDraft.state?.values[name]
		).length
	);
	const preferencesCopy = $derived(
		resolvePreferencesRowCopy(consent.state.copy, onCount)
	);
	let preferencesOpen = $state(false);
	const preferencesId = $derived(`${idPrefix}-preferences`);
</script>

<SurfaceStyles
	sheets={PANEL_SHEETS}
	{noStyle}
/>

{#snippet rights()}
	<SaleRightsRow
		{idPrefix}
		testIdPrefix="consent-banner"
		{uiSource}
		themeKey="consentBannerRightsRow"
		{noStyle}
	/>
{/snippet}

{#snippet advertising()}
	{#if sale}
		<AdvertisingRow
			on={saleOn}
			{idPrefix}
			{noStyle}
		/>
	{/if}
{/snippet}

{#if variant === 'choice'}
	<CategoryGroup
		{idPrefix}
		testIdPrefix="consent-banner"
		{noStyle}
	/>
{:else if variant === 'us-consent'}
	{@render rights()}
	<div>
		<button
			type="button"
			class={cx(noStyle, styles.navRow)}
			aria-expanded={preferencesOpen}
			aria-controls={preferencesId}
			data-testid="consent-banner-preferences-row"
			onclick={() => {
				preferencesOpen = !preferencesOpen;
			}}
		>
			<span class={cx(noStyle, styles.navRowLabel)}>
				{preferencesCopy.title}
				<span class={cx(noStyle, styles.navRowMeta)}>
					{preferencesCopy.summary} · {preferencesCopy.onCount}
				</span>
			</span>
			<span class={cx(noStyle, styles.chevron)}>
				<Icon name="chevron-down" />
			</span>
		</button>
		<div
			class={cx(noStyle, expandStyles.panel)}
			id={preferencesId}
			data-open={preferencesOpen}
			inert={!preferencesOpen}
		>
			<div class={cx(noStyle, expandStyles.inner)}>
				<div class={cx(noStyle, styles.preferencesBody)}>
					<CategoryGroup
						{idPrefix}
						testIdPrefix="consent-banner"
						exclude={sale ? [sale] : []}
						footer={advertising}
						{noStyle}
					/>
				</div>
			</div>
		</div>
	</div>
{:else if variant === 'notice'}
	{@render rights()}
{/if}
