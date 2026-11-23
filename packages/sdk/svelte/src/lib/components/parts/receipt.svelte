<script lang="ts">
	/**
	 * The receipt under the rights rows (RCPT-01): "✓ Saved for this browser
	 * · Jan 15, 2026" with Details, shown only once something is recorded or
	 * a GPC signal is honored, and then read as live (GPC-06). It stays
	 * mounted and toggles `data-open`, so the rows below never move or lose
	 * focus (RCPT-03).
	 *
	 * Copying the reference announces only after the clipboard accepted it.
	 * When it fails, a labelled field holds the full reference; it takes
	 * focus only if Details is still open (CLIP-01, CLIP-03). The surface
	 * session tokens each attempt, so a late result is ignored (CLIP-02).
	 */
	import { copySurfaceReference, resolveRightsReceipt } from '@inth/sdk/engine';
	import { resolveRightsReceiptCopy } from '@inth/sdk/surface-state';
	import styles from '@inth/sdk/ui/styles/components/consent-dialog';
	import type { AllThemeKeys } from '@inth/sdk/ui/theme';
	import { tick } from 'svelte';

	import {
		getConsentContext,
		getThemeContext,
	} from '../../get-consent-context.svelte';
	import Icon from './icon.svelte';
	import { cx, part } from './surface-parts.model';
	import {
		rightsBundleOf,
		useOptOutReceiptData,
		useSurfaceSession,
	} from './use-surface-session.svelte';

	let {
		idPrefix,
		business,
		themeKey,
		noStyle = false,
		panelVisible,
	}: {
		/** Prefix for element ids in this layer (SR-05). */
		idPrefix: string;
		/** The site's name for `{business}`. */
		business?: string;
		themeKey?: AllThemeKeys;
		noStyle?: boolean;
		/**
		 * The receipt's panel shows although its banner is not expanded, as
		 * in an all-in-one side drawer, so a failed copy may still reveal the
		 * fallback field there.
		 */
		panelVisible?: boolean;
	} = $props();

	/** How long the copy button shows its check. */
	const COPIED_MS = 1500;

	const consent = getConsentContext();
	const theme = getThemeContext();
	const surface = useSurfaceSession();

	// This browser's local opt-out receipt data: the reference it recorded.
	const receiptData = useOptOutReceiptData();
	const local = $derived(receiptData.current);

	let fieldEl = $state<HTMLInputElement | null>(null);

	const receipt = $derived(resolveRightsReceipt(consent.snapshot, local));
	const copy = $derived(
		resolveRightsReceiptCopy(consent.state.copy, {
			bundle: rightsBundleOf(consent.snapshot, local),
			business,
			receipt,
		})
	);
	const detailsOpen = $derived(surface.state.receiptOpen && receipt.show);
	const status = $derived(surface.state.copy.status);
	const ids = $derived({
		details: `${idPrefix}-receipt-details`,
		field: `${idPrefix}-reference-field`,
		fieldLabel: `${idPrefix}-reference-field-label`,
	});
	const rootPart = $derived(
		part(themeKey, theme.theme, [styles.disclosure, styles.bleed], noStyle)
	);

	// The check on the copy button goes after a moment.
	$effect(() => {
		if (status !== 'copied') {
			return;
		}
		const { session } = surface;
		const timer = setTimeout(() => session.resetCopy(), COPIED_MS);
		return () => clearTimeout(timer);
	});

	const copyReference = async function copyReference() {
		const { reference } = receipt;
		if (!reference) {
			return;
		}
		const { session } = surface;
		const finish = await copySurfaceReference(
			consent.kernel,
			reference,
			undefined,
			{ panelVisible }
		);
		if (!(finish.applied && finish.reveal)) {
			return;
		}
		const failed = session.getState().copy.status === 'failed';
		session.announce(failed ? copy.copyFailed : copy.copied);
		if (failed) {
			// The field renders with the failure; focus it once it has.
			await tick();
			requestAnimationFrame(() => {
				fieldEl?.focus({ preventScroll: true });
				fieldEl?.select();
			});
		}
	};
</script>

<div
	class={rootPart.class}
	style={rootPart.style}
	data-open={receipt.show}
	inert={!receipt.show}
	data-receipt-kind={receipt.show ? receipt.kind : undefined}
	data-testid="consent-dialog-receipt"
	tabindex="-1"
>
	<div class={cx(noStyle, styles.disclosureInner)}>
		<div class={cx(noStyle, styles.receipt)}>
			<div class={cx(noStyle, styles.receiptLine)}>
				<span class={cx(noStyle, styles.receiptLead)}>
					<Icon name="check" />
					<span>{copy.lead}</span>
				</span>
				<button
					type="button"
					class={cx(noStyle, styles.textButton)}
					aria-expanded={detailsOpen}
					aria-controls={ids.details}
					data-testid="consent-dialog-receipt-toggle"
					onclick={() => surface.session.toggleReceipt()}
				>
					{copy.details}
					<span class={cx(noStyle, styles.chevron)}>
						<Icon
							name="chevron-down"
							size={12}
						/>
					</span>
				</button>
			</div>
			<div
				class={cx(noStyle, styles.disclosure)}
				id={ids.details}
				data-open={detailsOpen}
				inert={!detailsOpen}
				data-testid="consent-dialog-receipt-details"
			>
				<div class={cx(noStyle, styles.disclosureInner)}>
					<div class={cx(noStyle, styles.receiptDetails)}>
						<ul>
							{#each copy.items as item (item.text)}
								<li>
									{item.text}{#if item.source}<span
											class={cx(noStyle, styles.receiptMuted)}
											>{` · ${item.source}`}</span
										>{/if}
								</li>
							{/each}
						</ul>
						<div class={cx(noStyle, styles.receiptMuted)}>{copy.scope}</div>
						<div class={cx(noStyle, styles.receiptMuted)}>
							{copy.recorded}{#if receipt.kind === 'stored' && receipt.reference}{` · ${copy.referenceLabel} `}<span
									class={cx(noStyle, styles.reference)}
									title={receipt.reference}
									>{receipt.reference.slice(0, 8)}<button
										type="button"
										class={cx(noStyle, styles.copyButton)}
										aria-label={copy.copy}
										data-copied={status === 'copied' ? 'true' : undefined}
										data-testid="consent-dialog-copy-reference"
										onclick={() => {
											void copyReference();
										}}
									>
										{#if status === 'copied'}
											<Icon name="check" />
										{:else}
											<Icon name="copy" />
										{/if}
									</button></span
								>{/if}
						</div>
						{#if status === 'failed' && receipt.reference}
							<div>
								<label
									for={ids.field}
									id={ids.fieldLabel}
								>
									{copy.copyFailedLabel}
								</label>
								<input
									bind:this={fieldEl}
									id={ids.field}
									class={cx(noStyle, styles.referenceField)}
									type="text"
									readonly
									value={receipt.reference}
									data-testid="consent-dialog-reference-field"
								/>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
