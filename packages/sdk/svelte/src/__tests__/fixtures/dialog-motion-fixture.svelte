<script lang="ts">
	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/manager-options.model';

	let {
		options,
		disableAnimation = undefined,
	}: {
		options: ConsentManagerOptions;
		disableAnimation?: boolean;
	} = $props();
</script>

<InthProvider {options}>
	<ConsentDialog
		{disableAnimation}
		open
	/>
</InthProvider>
