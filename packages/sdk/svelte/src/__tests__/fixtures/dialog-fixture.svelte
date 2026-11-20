<script lang="ts">
	import type { Model } from '@inth/sdk/engine';

	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentDialog from '../../lib/components/panel.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let {
		options,
		open = undefined,
		models = undefined,
		hideBranding = undefined,
	}: {
		options: ConsentManagerOptions;
		open?: boolean;
		models?: Model[];
		hideBranding?: boolean;
	} = $props();
</script>

<InthProvider {options}>
	<ConsentDialog
		{open}
		{models}
		{hideBranding}
	/>
</InthProvider>
