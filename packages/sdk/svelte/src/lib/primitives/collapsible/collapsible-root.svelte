<script lang="ts">
	import {
		getCollapsibleState,
		getDataDisabled,
		toggleCollapsibleValue,
	} from '@inth/sdk/ui/primitives';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import { setCollapsibleRootContext } from './get-collapsible-root-context';

	const componentId = $props.id();

	let {
		children,
		class: className,
		disabled = false,
		open = $bindable(false),
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		class?: string;
		disabled?: boolean;
		open?: boolean;
	} = $props();

	const dataState = $derived(getCollapsibleState(open));
	const dataDisabled = $derived(getDataDisabled(disabled));
	const triggerId = `inth-collapsible-trigger-${componentId}`;
	const contentId = `inth-collapsible-content-${componentId}`;

	const setOpen = function setOpen(nextOpen: boolean) {
		if (disabled) {
			return;
		}

		open = nextOpen;
	};

	const toggle = function toggle() {
		setOpen(toggleCollapsibleValue(open));
	};

	setCollapsibleRootContext({
		get contentId() {
			return contentId;
		},
		get disabled() {
			return disabled;
		},
		get open() {
			return open;
		},
		setOpen,
		toggle,
		get triggerId() {
			return triggerId;
		},
	});
</script>

<div
	class={className}
	data-slot="collapsible-root"
	data-state={dataState}
	data-disabled={dataDisabled}
	{...restProps}
>
	{@render children?.()}
</div>
