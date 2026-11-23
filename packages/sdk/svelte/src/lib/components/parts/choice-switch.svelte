<script lang="ts">
	/**
	 * A category switch: a `role="switch"` button the row names with
	 * `aria-labelledby` and describes with `aria-describedby` (SR-06). Never
	 * `disabled` for a vendor (CAT-03); a category that cannot change shows
	 * "Always on" instead of a switch. Takes the `toggle` theme slot, as
	 * the `ConsentWidget` switch does.
	 */
	import styles from '@inth/sdk/ui/styles/components/consent-dialog';

	import { getThemeContext } from '../../get-theme-context';
	import { part } from './surface-parts.model';

	let {
		checked,
		onCheckedChange,
		size = 'default',
		noStyle = false,
		labelledby,
		describedby,
		testId,
	}: {
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
		/** The vendor table's switches are smaller. */
		size?: 'default' | 'small';
		noStyle?: boolean;
		labelledby?: string;
		describedby?: string;
		testId?: string;
	} = $props();

	const theme = getThemeContext();
	const attrs = $derived(part('toggle', theme.theme, styles.switch, noStyle));
</script>

<!-- A switch, not a checkbox: it applies or stages at once, and screen
     readers announce on and off. -->
<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-labelledby={labelledby}
	aria-describedby={describedby}
	class={attrs.class}
	style={attrs.style}
	data-size={size === 'small' ? 'small' : undefined}
	data-state={checked ? 'checked' : 'unchecked'}
	data-testid={testId}
	onclick={() => onCheckedChange(!checked)}
></button>
