<script
	lang="ts"
	module
>
	/** Surfaces that render the rights row, by their test-id prefix. */
	export type RightsRowSurface = 'consent-banner' | 'consent-dialog';

	/**
	 * The row's test ids on each surface, spelled out so each one matches
	 * `internals/conformance/src/contract/test-ids.ts`.
	 */
	const ROW_TEST_IDS = {
		'consent-banner': {
			allow: 'consent-banner-right-option-sale-allow',
			confirm: 'consent-banner-confirm',
			confirmAllow: 'consent-banner-confirm-allow',
			confirmCancel: 'consent-banner-confirm-cancel',
			protect: 'consent-banner-right-option-sale-protect',
			row: 'consent-banner-rights-row-sale',
		},
		'consent-dialog': {
			allow: 'consent-dialog-right-option-sale-allow',
			confirm: 'consent-dialog-confirm',
			confirmAllow: 'consent-dialog-confirm-allow',
			confirmCancel: 'consent-dialog-confirm-cancel',
			protect: 'consent-dialog-right-option-sale-protect',
			row: 'consent-dialog-rights-row-sale',
		},
	} as const satisfies Record<RightsRowSurface, Record<string, string>>;
</script>

<script lang="ts">
	/**
	 * The statutory sale row (LAW-01, RIGHT-01..06, GPC-03, GPC-04): a
	 * segmented control for selling, sharing and targeted ads, the
	 * confirmation that opting back in needs, and the GPC note. Refusing
	 * applies in one press; allowing a refusal, or any grant under opt-in,
	 * opens the confirmation in place and records nothing until the visitor
	 * confirms (LAW-02). Pressing Allow again while it is open nudges
	 * (RIGHT-04). Shared by the banner panels and the dialog.
	 *
	 * Renders nothing when the policy has no category that decides sale.
	 */
	import {
		confirmSaleRight,
		pressSaleRight,
		resolveSaleRight,
	} from '@inth/sdk/engine';
	import type { RightOption, SaveUISource } from '@inth/sdk/engine';
	import {
		resolvePrivacyChoicesCopy,
		resolveSaleAnnouncement,
		resolveSaleRightCopy,
	} from '@inth/sdk/surface-state';
	import type { SaleAnnouncementOutcome } from '@inth/sdk/surface-state';
	import {
		revealInScrollBody,
		scheduleReveal,
	} from '@inth/sdk/ui/primitives/surface';
	import styles from '@inth/sdk/ui/styles/components/consent-dialog';
	import expandStyles from '@inth/sdk/ui/styles/components/consent-expand';
	import type { AllThemeKeys } from '@inth/sdk/ui/theme';
	import { untrack } from 'svelte';

	import { getConsentContext } from '../../get-consent-context.svelte';
	import { getThemeContext } from '../../get-theme-context';
	import ConsentButton from '../action-button.svelte';
	import Icon from './icon.svelte';
	import { cx, part } from './surface-parts.model';
	import { rightsBundleOf } from './rights-bundle.model';
	import { useOptOutReceiptData } from './use-opt-out-receipt-data.svelte';
	import { useSurfaceSession } from './use-surface-session.svelte';

	let {
		idPrefix,
		testIdPrefix,
		business,
		uiSource,
		themeKey,
		noStyle = false,
		onRecorded,
	}: {
		/**
		 * Prefix for the row's element ids. Each layer that renders the row
		 * passes its own, so `aria-labelledby` never resolves into another
		 * layer (SR-05).
		 */
		idPrefix: string;
		/** The surface it renders on, which prefixes its test ids. */
		testIdPrefix: RightsRowSurface;
		/** The site's name for `{business}`. */
		business?: string;
		/** Surface the recorded choice is attributed to. */
		uiSource?: SaveUISource;
		/** The `theme.slots` key that styles the row. */
		themeKey?: AllThemeKeys;
		noStyle?: boolean;
		/** Called after the row recorded a choice, for the dialog's "Saved" cue. */
		onRecorded?: () => void;
	} = $props();

	const OPTIONS: readonly RightOption[] = ['protect', 'allow'];

	const consent = getConsentContext();
	const theme = getThemeContext();
	const surface = useSurfaceSession();
	const receiptData = useOptOutReceiptData();

	let confirmEl = $state<HTMLDivElement | null>(null);
	let cancelEl = $state<HTMLButtonElement | null>(null);
	let allowEl = $state<HTMLButtonElement | null>(null);

	const snapshot = $derived(consent.snapshot);
	const translations = $derived(consent.state.copy);
	const right = $derived(resolveSaleRight(snapshot));
	const open = $derived(surface.state.confirmation?.right === 'sale');
	const nudges = $derived(open ? (surface.state.confirmation?.nudges ?? 0) : 0);
	const model = $derived(snapshot.evaluationPolicy.model);
	const bundle = $derived(rightsBundleOf(snapshot, receiptData.current));
	const copy = $derived(
		resolveSaleRightCopy(translations, {
			bundle,
			business,
			locked: right.locked,
			model,
			selected: right.selected,
			source: right.source,
		})
	);
	const testIds = $derived(ROW_TEST_IDS[testIdPrefix]);
	const ids = $derived({
		cancel: `${idPrefix}-sale-confirm-cancel`,
		confirmDescription: `${idPrefix}-sale-confirm-description`,
		confirmTitle: `${idPrefix}-sale-confirm-title`,
		description: `${idPrefix}-sale-description`,
		panel: `${idPrefix}-sale-confirm`,
		title: `${idPrefix}-sale-title`,
	});
	const rowPart = $derived(part(themeKey, theme.theme, styles.right, noStyle));

	// Focus follows the confirmation: Cancel when it opens (RIGHT-06), the
	// invoking Allow when it closes from inside it.
	let wasOpen = false;
	$effect(() => {
		const isOpen = open;
		return untrack(() => {
			const confirm = confirmEl;
			let cancelReveal: (() => void) | undefined;
			if (isOpen && !wasOpen) {
				cancelEl?.focus({ preventScroll: true });
				// Bring the question into view in the scroll body only, once it
				// has started to open, unless the surface moved on (RIGHT-07,
				// LAY-05, PERM-16).
				const { session } = surface;
				const { token } = session.getState();
				cancelReveal = scheduleReveal(
					() => {
						if (confirm) {
							revealInScrollBody(confirm);
						}
					},
					{ isCurrent: () => session.isCurrent(token) }
				);
			} else if (
				!isOpen &&
				wasOpen &&
				confirm &&
				(confirm.contains(document.activeElement) ||
					document.activeElement === document.body)
			) {
				allowEl?.focus({ preventScroll: true });
			}
			wasOpen = isOpen;
			return cancelReveal;
		});
	});

	// Replay the shake on every nudge; the red ring stays until it closes.
	$effect(() => {
		const count = nudges;
		untrack(() => {
			const confirm = confirmEl;
			if (!confirm || count === 0) {
				return;
			}
			confirm.dataset.nudged = 'false';
			void confirm.offsetWidth;
			confirm.dataset.nudged = 'true';
			cancelEl?.focus({ preventScroll: true });
		});
	});

	/** Say what was recorded, ending in "Saved." (LAW-04). */
	const recorded = function recorded(outcome: SaleAnnouncementOutcome) {
		surface.session.announce(
			resolveSaleAnnouncement(translations, { bundle, model, outcome })
		);
		onRecorded?.();
	};

	const press = function press(option: RightOption) {
		const { outcome } = pressSaleRight(consent.kernel, option, { uiSource });
		if (outcome === 'nudge') {
			surface.session.announce(resolvePrivacyChoicesCopy(translations).nudge);
		} else if (outcome === 'apply-protect') {
			recorded('protect');
		} else if (outcome === 'apply-allow') {
			recorded('allow');
		} else if (outcome === 'record-default') {
			recorded('recorded');
		}
	};

	const confirmAllow = function confirmAllow() {
		if (confirmSaleRight(consent.kernel, { uiSource })) {
			recorded('allow');
		}
	};
</script>

{#if right.available && right.category !== null}
	<section
		class={rowPart.class}
		style={rowPart.style}
		aria-labelledby={ids.title}
		data-testid={testIds.row}
	>
		<div>
			<h3
				class={cx(noStyle, styles.rightTitle)}
				id={ids.title}
			>
				{copy.title}
			</h3>
			{#if !right.locked}
				<p
					class={cx(noStyle, styles.rightDescription)}
					id={ids.description}
				>
					{copy.description}
				</p>
			{/if}
		</div>
		{#if right.locked}
			<div
				class={cx(noStyle, styles.note)}
				id={ids.description}
			>
				<span>{copy.description}</span>
			</div>
		{/if}
		<!-- Pressed buttons in a group, never radios (RIGHT-01); a fieldset
		     would bring its own border and legend. -->
		<div
			class={cx(noStyle, styles.segmented)}
			role="group"
			aria-label={copy.groupLabel}
			aria-describedby={ids.description}
			data-selected={right.selected === 'protect' ? '0' : '1'}
		>
			<span
				class={cx(noStyle, styles.segmentedThumb)}
				aria-hidden="true"
			></span>
			{#each OPTIONS as option (option)}
				{@const pressed = right.selected === option}
				{#if option === 'allow'}
					<button
						bind:this={allowEl}
						type="button"
						class={cx(noStyle, styles.segmentedOption)}
						aria-pressed={pressed}
						aria-disabled={right.locked && !pressed ? true : undefined}
						data-right-option={option}
						data-testid={testIds[option]}
						onclick={() => press(option)}
					>
						<span
							class={cx(noStyle, styles.segmentedCheck)}
							aria-hidden="true"
						>
							<Icon
								name="check"
								size={13}
							/>
						</span>
						{copy.allow}
					</button>
				{:else}
					<!-- Under GPC only the unselected option is disabled (GPC-03). -->
					<button
						type="button"
						class={cx(noStyle, styles.segmentedOption)}
						aria-pressed={pressed}
						aria-disabled={right.locked && !pressed ? true : undefined}
						data-right-option={option}
						data-testid={testIds[option]}
						onclick={() => press(option)}
					>
						<span
							class={cx(noStyle, styles.segmentedCheck)}
							aria-hidden="true"
						>
							<Icon
								name="check"
								size={13}
							/>
						</span>
						{copy.protect}
					</button>
				{/if}
			{/each}
		</div>
		<div
			class={cx(noStyle, expandStyles.panel, styles.bleed)}
			id={ids.panel}
			data-open={open}
			inert={!open}
		>
			<div class={cx(noStyle, expandStyles.inner)}>
				<!-- A labelled group, as the dialog's confirmation is; a fieldset
				     would bring its own border and legend. -->
				<div
					bind:this={confirmEl}
					class={cx(noStyle, styles.confirm)}
					role="group"
					aria-labelledby={ids.confirmTitle}
					aria-describedby={ids.confirmDescription}
					data-nudged={nudges > 0}
					data-testid={testIds.confirm}
				>
					<p
						class={cx(noStyle, styles.confirmTitle)}
						id={ids.confirmTitle}
					>
						{copy.confirmTitle}
					</p>
					<p
						class={cx(noStyle, styles.confirmDescription)}
						id={ids.confirmDescription}
					>
						{copy.confirmDescription}
					</p>
					<div class={cx(noStyle, styles.confirmActions)}>
						<ConsentButton
							onref={(element) => {
								cancelEl = element;
							}}
							action="custom-consent"
							performDefaultAction={false}
							variant="neutral"
							mode="stroke"
							{noStyle}
							id={ids.cancel}
							data-testid={testIds.confirmCancel}
							onclick={() => surface.session.closeConfirmation()}
						>
							{copy.confirmCancel}
						</ConsentButton>
						<ConsentButton
							action="custom-consent"
							performDefaultAction={false}
							variant="neutral"
							mode="stroke"
							{noStyle}
							data-testid={testIds.confirmAllow}
							onclick={confirmAllow}
						>
							{copy.confirmAllow}
						</ConsentButton>
					</div>
				</div>
			</div>
		</div>
	</section>
{/if}
