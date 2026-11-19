<script lang="ts">
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';
	import ContextReader from './context-reader.svelte';

	let { options }: { options: ConsentManagerOptions } = $props();
</script>

<InthProvider {options}><ContextReader /></InthProvider>
