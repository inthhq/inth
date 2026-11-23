<script lang="ts">
	import ConsentGate from '../../lib/components/consent-gate.svelte';
	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentWidget from '../../lib/components/preferences.svelte';
	import ConsentBanner from '../../lib/components/prompt/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';

	let {
		options,
		surface = 'banner',
	}: {
		options: ConsentManagerOptions;
		/** The open dialog replaces the banner, so each renders on its own. */
		surface?: 'banner' | 'dialog' | 'widget';
	} = $props();
</script>

<InthProvider {options}>
	{#if surface === 'banner'}
		<ConsentBanner legalLinks={['privacyPolicy']} />
	{:else if surface === 'dialog'}
		<ConsentDialog open />
	{:else}
		<ConsentWidget />
	{/if}
	<ConsentGate category="marketing" />
</InthProvider>
