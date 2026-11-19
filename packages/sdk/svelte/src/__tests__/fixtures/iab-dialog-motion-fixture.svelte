<script lang="ts">
	import IabConsentDialog from '../../lib/components/iab-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let {
		options,
		disableAnimation = undefined,
	}: {
		options: ConsentManagerOptions;
		disableAnimation?: boolean;
	} = $props();
</script>

<InthProvider {options}>
	<IabConsentDialog
		{disableAnimation}
		open
	/>
</InthProvider>
