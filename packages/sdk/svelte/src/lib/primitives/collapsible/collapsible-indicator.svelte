<script lang="ts">
	import { getCollapsibleState } from '@inth/sdk/ui/primitives';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import { getCollapsibleRootContext } from './get-collapsible-root-context';

	const root = getCollapsibleRootContext();

	const dataState = $derived(getCollapsibleState(root.open));

	let {
		children,
		class: className,
		...restProps
	}: HTMLAttributes<HTMLSpanElement> & {
		children?: Snippet;
		class?: string;
	} = $props();
</script>

<span
	class={className}
	data-slot="collapsible-indicator"
	data-state={dataState}
	{...restProps}
>
	{@render children?.()}
</span>
