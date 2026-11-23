<script lang="ts">
	import type { ConsentSnapshot } from '@inth/sdk/engine';

	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentBanner from '../../lib/components/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';
	import Page from './privacy-choices-page.svelte';

	/** The stock banner and, when asked, the stock dialog, over a page. */
	let {
		options,
		probe,
		dialog = false,
		triggerLabel,
	}: {
		options: ConsentManagerOptions;
		probe: { snapshot: ConsentSnapshot | null };
		dialog?: boolean;
		triggerLabel?: string;
	} = $props();
</script>

<InthProvider {options}>
	<Page
		{probe}
		{triggerLabel}
	/>
	<ConsentBanner disableAnimation />
	{#if dialog}
		<ConsentDialog disableAnimation />
	{/if}
</InthProvider>
