<script lang="ts">
	import {
		getDataDisabled,
		getOpenState,
		isAccordionItemOpen,
	} from '@inth/sdk/ui/primitives';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import { getAccordionRootContext, setAccordionItemContext } from './context';

	const componentId = $props.id();
	const root = getAccordionRootContext();

	let {
		children,
		class: className,
		disabled = false,
		value,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		class?: string;
		disabled?: boolean;
		value: string;
	} = $props();

	const open = $derived(isAccordionItemOpen(root.type, root.value, value));
	const dataState = $derived(getOpenState(open));
	const dataDisabled = $derived(getDataDisabled(disabled));
	const triggerId = `inth-accordion-trigger-${componentId}`;
	const contentId = `inth-accordion-content-${componentId}`;

	setAccordionItemContext({
		get contentId() {
			return contentId;
		},
		get disabled() {
			return disabled;
		},
		get open() {
			return open;
		},
		get triggerId() {
			return triggerId;
		},
		get value() {
			return value;
		},
	});
</script>

<div
	class={className}
	data-slot="accordion-item"
	data-state={dataState}
	data-disabled={dataDisabled}
	{...restProps}
>
	{@render children?.()}
</div>
