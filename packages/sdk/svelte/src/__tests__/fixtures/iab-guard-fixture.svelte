<script lang="ts">
	import IABConsentBanner from '../../lib/components/iab/iab-prompt.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentBanner from '../../lib/components/prompt/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/manager-options.model';

	let {
		options,
		onError,
	}: {
		options: ConsentManagerOptions;
		onError: (error: unknown) => void;
	} = $props();
</script>

<svelte:boundary onerror={onError}>
	<InthProvider {options}>
		<ConsentBanner />
		<IABConsentBanner />
	</InthProvider>
</svelte:boundary>
