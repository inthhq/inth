<script lang="ts">
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentDialog from '../../lib/components/panel.svelte';
	import ConsentBanner from '../../lib/components/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let { options }: { options: ConsentManagerOptions } = $props();
</script>

<InthProvider {options}>
	<ConsentBanner />
	<ConsentDialog />
</InthProvider>
