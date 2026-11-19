<script lang="ts">
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentDialog from '../../lib/components/panel.svelte';
	import ConsentBanner from '../../lib/components/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	/**
	 * One stock surface at a time, so its focus trap has no rival: a
	 * blocking banner, or the dialog held open by its `open` prop.
	 */
	let {
		options,
		surface,
	}: {
		options: ConsentManagerOptions;
		surface: 'banner' | 'dialog';
	} = $props();
</script>

<InthProvider {options}>
	{#if surface === 'banner'}
		<ConsentBanner blocking />
	{:else}
		<ConsentDialog open />
	{/if}
</InthProvider>
