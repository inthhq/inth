<script lang="ts">
	import type { Model } from '@inth/sdk/engine';

	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentBanner from '../../lib/components/prompt/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';

	let {
		options,
		models = undefined,
	}: {
		options: ConsentManagerOptions;
		models?: Model[];
	} = $props();
</script>

<InthProvider {options}>
	<ConsentBanner {models} />
</InthProvider>
