<script lang="ts">
	import type { Model } from '@inth/sdk/engine';

	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let {
		options,
		open = undefined,
		models = undefined,
	}: {
		options: ConsentManagerOptions;
		open?: boolean;
		models?: Model[];
	} = $props();
</script>

<InthProvider {options}>
	<ConsentDialog
		{open}
		{models}
	/>
</InthProvider>
