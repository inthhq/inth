<script lang="ts">
	import {
		getDataDisabled,
		getPreferenceItemState,
		PREFERENCE_ITEM_SLOTS,
		togglePreferenceItemValue,
	} from '@inth/sdk/ui/primitives';
	import { preferenceItemVariants } from '@inth/sdk/ui/styles/primitives';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	import { getThemeContext } from '../../context.svelte';
	import { setPreferenceItemContext } from './context';

	const componentId = $props.id();
	const theme = getThemeContext();
	const variants = preferenceItemVariants();

	let {
		children,
		class: className,
		disabled = false,
		noStyle: localNoStyle,
		open = $bindable(false),
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		class?: string;
		disabled?: boolean;
		noStyle?: boolean;
		open?: boolean;
	} = $props();

	const noStyle = $derived(localNoStyle ?? theme.noStyle ?? false);
	const rootClassName = $derived(
		noStyle ? className : variants.root({ class: className })
	);
	const dataState = $derived(getPreferenceItemState(open));
	const dataDisabled = $derived(getDataDisabled(disabled));
	const contentId = `inth-preference-item-content-${componentId}`;
	const triggerId = `inth-preference-item-trigger-${componentId}`;

	const setOpen = function setOpen(nextOpen: boolean) {
		open = nextOpen;
	};

	const toggle = function toggle() {
		if (!disabled) {
			setOpen(togglePreferenceItemValue(open));
		}
	};

	setPreferenceItemContext({
		get contentId() {
			return contentId;
		},
		get disabled() {
			return disabled;
		},
		get noStyle() {
			return noStyle;
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
	class={rootClassName}
	data-slot={PREFERENCE_ITEM_SLOTS.root}
	data-state={dataState}
	data-disabled={dataDisabled}
	{...restProps}
>
	{@render children?.()}
</div>
