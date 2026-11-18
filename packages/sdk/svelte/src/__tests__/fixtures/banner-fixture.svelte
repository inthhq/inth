<script lang="ts">
	import type { Model } from '@inth/sdk/engine';

	import ConsentProvider from '../../lib/components/consent-provider.svelte';
	import ConsentBanner from '../../lib/components/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let {
		options,
		models = undefined,
	}: {
		options: ConsentManagerOptions;
		models?: Model[];
	} = $props();
</script>

<ConsentProvider {options}>
	<ConsentBanner {models} />
</ConsentProvider>
