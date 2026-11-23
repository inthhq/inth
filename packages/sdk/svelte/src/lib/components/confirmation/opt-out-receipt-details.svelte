<script lang="ts">
	import { resolveOptOutCopy } from '@inth/sdk/surface-state';
	import styles from '@inth/sdk/ui/styles/components/opt-out-confirmation';

	import { getConsentContext } from '../../get-consent-context.svelte';
	import { getThemeContext } from '../../get-theme-context';

	const DEFAULT_LANGUAGE = 'en';

	const formatRecordedAt = function formatRecordedAt(
		at: number,
		language: string
	): string {
		try {
			return new Intl.DateTimeFormat(language, {
				dateStyle: 'medium',
				timeStyle: 'short',
			}).format(at);
		} catch {
			return new Intl.DateTimeFormat(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short',
			}).format(at);
		}
	};

	const {
		noStyle: localNoStyle,
		testId = 'opt-out-confirmation-receipt',
		recordedAtTestId = 'opt-out-confirmation-recorded-at',
		referenceTestId = 'opt-out-confirmation-reference',
	}: {
		noStyle?: boolean;
		testId?: string;
		recordedAtTestId?: string;
		referenceTestId?: string;
	} = $props();

	const consent = getConsentContext();
	const theme = getThemeContext();

	const noStyle = $derived(Boolean(localNoStyle ?? theme.noStyle));
	const receipt = $derived(consent.state.optOutState);
	const optOutCopy = $derived(resolveOptOutCopy(consent.state.copy));
	const language = $derived(
		consent.state.translations?.language ?? DEFAULT_LANGUAGE
	);
</script>

{#if receipt.at !== null || receipt.reference !== null}
	<dl
		class={noStyle ? undefined : styles.receipt}
		data-testid={testId}
	>
		{#if receipt.at !== null}
			<div class={noStyle ? undefined : styles.receiptRow}>
				<dt class={noStyle ? undefined : styles.receiptLabel}>
					{optOutCopy.recordedLabel}
				</dt>
				<dd class={noStyle ? undefined : styles.receiptValue}>
					<time
						datetime={new Date(receipt.at).toISOString()}
						data-testid={recordedAtTestId}
					>
						{formatRecordedAt(receipt.at, language)}
					</time>
				</dd>
			</div>
		{/if}
		{#if receipt.reference !== null}
			<div class={noStyle ? undefined : styles.receiptRow}>
				<dt class={noStyle ? undefined : styles.receiptLabel}>
					{optOutCopy.referenceLabel}
				</dt>
				<dd class={noStyle ? undefined : styles.receiptValue}>
					<code
						class={noStyle ? undefined : styles.reference}
						data-testid={referenceTestId}
					>
						{receipt.reference}
					</code>
				</dd>
			</div>
		{/if}
	</dl>
{/if}
