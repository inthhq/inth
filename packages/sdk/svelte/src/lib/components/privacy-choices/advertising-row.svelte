<script lang="ts">
	/** The read-only US advertising row: it follows the sale choice (LAW-05, CAT-08). */
	import { resolveAdvertisingRowCopy } from '@inth/sdk/surface-state';
	import styles from '@inth/sdk/ui/styles/components/privacy-choices';

	import { getConsentContext } from '../../context.svelte';
	import { cx } from './parts';

	let {
		on,
		idPrefix,
		noStyle = false,
		testId,
	}: {
		on: boolean;
		idPrefix: string;
		noStyle?: boolean;
		testId?: 'consent-dialog-advertising-row';
	} = $props();

	const consent = getConsentContext();
	const copy = $derived(resolveAdvertisingRowCopy(consent.state.copy, on));
</script>

<div
	class={cx(noStyle, styles.category)}
	data-category="advertising"
	data-testid={testId}
>
	<div class={cx(noStyle, styles.categoryRow)}>
		<div class={cx(noStyle, styles.categoryText)}>
			<span
				class={cx(noStyle, styles.categoryName)}
				id={`${idPrefix}-advertising`}
			>
				{copy.title}
			</span>
			<span
				class={cx(noStyle, styles.categoryDescription)}
				id={`${idPrefix}-advertising-description`}
			>
				{copy.description}
			</span>
		</div>
		<span
			class={cx(noStyle, styles.categoryState)}
			aria-describedby={`${idPrefix}-advertising-description`}
		>
			{copy.state}
		</span>
	</div>
</div>
