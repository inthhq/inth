<script lang="ts">
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/manager-options.model';

	let { options }: { options: ConsentManagerOptions } = $props();
</script>

<InthProvider {options} />
