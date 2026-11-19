<script lang="ts">
	import { ConsentDialog } from '../../lib';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let { options }: { options: ConsentManagerOptions } = $props();
</script>

<InthProvider {options}>
	<ConsentDialog showTrigger />
</InthProvider>
