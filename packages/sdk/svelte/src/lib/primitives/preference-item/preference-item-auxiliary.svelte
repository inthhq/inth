<script lang="ts">
	import { PREFERENCE_ITEM_SLOTS } from '@inth/sdk/ui/primitives';
	import { preferenceItemVariants } from '@inth/sdk/ui/styles/primitives';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import { getPreferenceItemContext } from './context';

	const context = getPreferenceItemContext();
	const variants = preferenceItemVariants();

	let {
		children,
		class: localClassName,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		class?: string;
	} = $props();

	const noStyle = $derived(context.noStyle);
	const className = $derived.by(() =>
		noStyle ? localClassName : variants.auxiliary({ class: localClassName })
	);
</script>

<div
	class={className}
	data-slot={PREFERENCE_ITEM_SLOTS.auxiliary}
	{...restProps}
>
	{@render children?.()}
</div>
