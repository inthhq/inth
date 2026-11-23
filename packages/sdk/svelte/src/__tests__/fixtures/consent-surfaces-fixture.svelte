<script lang="ts">
	import type {
		ConsentKernel,
		ConsentPresentation,
		ConsentSnapshot,
	} from '@inth/sdk/engine';
	import type { Readable } from 'svelte/store';

	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import type { ConsentDialogProps } from '../../lib/components/dialog/panel-props.model';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentBanner from '../../lib/components/prompt/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/manager-options.model';
	import Page from './consent-surfaces-page.svelte';

	/** The stock banner and, when asked, the stock dialog, over a page. */
	let {
		options,
		probe,
		dialog = false,
		banner = true,
		bannerProps = {},
		dialogProps = { disableAnimation: true },
		oneClickOptOut = false,
		link = true,
		triggerLabel,
		open,
		presentation,
	}: {
		options: ConsentManagerOptions;
		probe: {
			snapshot: ConsentSnapshot | null;
			kernel?: ConsentKernel | null;
		};
		dialog?: boolean;
		/** Mount `ConsentBanner`. Without it, the dialog hosts the confirmations. */
		banner?: boolean;
		/** Over the banner's `disableAnimation`. */
		bannerProps?: Record<string, unknown>;
		dialogProps?: ConsentDialogProps;
		/** A page control that opts out in one click, as a "Do Not Sell" link does. */
		oneClickOptOut?: boolean;
		/** Render the stock "Your Privacy Choices" link, which warms the dialog. */
		link?: boolean;
		triggerLabel?: string;
		/** A controlled `open` for the dialog that the test can change. */
		open?: Readable<boolean>;
		/** A presentation the test can change, over `options.presentation`. */
		presentation?: Readable<ConsentPresentation | undefined>;
	} = $props();

	const resolved = $derived(
		presentation ? { ...options, presentation: $presentation } : options
	);
</script>

<InthProvider options={resolved}>
	<Page
		{probe}
		{triggerLabel}
		{oneClickOptOut}
		{link}
	/>
	{#if banner}
		<ConsentBanner
			disableAnimation
			{...bannerProps}
		/>
	{/if}
	{#if dialog}
		{#if open}
			<ConsentDialog
				{...dialogProps}
				open={$open}
			/>
		{:else}
			<ConsentDialog {...dialogProps} />
		{/if}
	{/if}
</InthProvider>
