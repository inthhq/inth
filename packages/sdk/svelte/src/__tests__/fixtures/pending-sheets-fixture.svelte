<script lang="ts">
	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentBanner from '../../lib/components/prompt/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';

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
		<ConsentBanner blockUntilChoice />
	{:else}
		<ConsentDialog open />
	{/if}
</InthProvider>
