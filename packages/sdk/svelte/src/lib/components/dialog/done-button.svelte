<script lang="ts">
	/**
	 * Done, which closes and commits nothing (LAW-04). Its label never
	 * changes (SR-07): on desktop the cue sits beside it, absolutely placed
	 * so Done never moves (MOT-04); on phone a check slides in before the
	 * label. The cue's slot is always there, so Done keeps its node and
	 * focus (FOC-06).
	 */
	import styles from '@inth/sdk/ui/styles/components/consent-dialog';
	import { resolveActionAppearance } from '@inth/sdk/ui/theme';

	import { getThemeContext } from '../../get-theme-context';
	import ConsentButton from '../action-button.svelte';
	import Icon from '../parts/icon.svelte';
	import { cx } from '../parts/surface-parts.model';

	let {
		cue,
		label,
		cueLabel,
		noStyle = false,
		testId,
		onclick,
	}: {
		cue: number;
		label: string;
		cueLabel: string;
		noStyle?: boolean;
		testId: 'consent-dialog-done' | 'consent-dialog-sheet-done';
		onclick: () => void;
	} = $props();

	const theme = getThemeContext();
</script>

<span
	class={cx(noStyle, styles.cueSlot)}
	aria-hidden="true"
>
	{#if cue > 0}
		{#key cue}
			<span
				class={cx(noStyle, styles.savedCue)}
				data-testid="consent-dialog-saved-cue"
			>
				<Icon name="check" />
				{cueLabel}
			</span>
		{/key}
	{/if}
</span>
<ConsentButton
	action="custom-consent"
	performDefaultAction={false}
	{...resolveActionAppearance(theme.theme, 'save', true)}
	themeKey="consentDialogDoneButton"
	baseClassName={styles.done}
	{noStyle}
	data-cue={cue > 0 ? 'true' : undefined}
	data-testid={testId}
	{onclick}
>
	<span
		class={cx(noStyle, styles.doneCheck)}
		aria-hidden="true"
	>
		<Icon name="check" />
	</span>
	{label}
</ConsentButton>
