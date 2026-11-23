<script lang="ts">
	import IabConsentDialog from '../../lib/components/iab/iab-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';

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
