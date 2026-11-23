<script lang="ts">
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentWidget from '../../lib/components/preferences.svelte';
	import type { ConsentContextValue } from '../../lib/consent-context.model';
	import type { ConsentManagerOptions } from '../../lib/manager-options.model';
	import Reader from './policy-state-reader.svelte';

	let {
		options,
		capture,
		noStyle = false,
	}: {
		options: ConsentManagerOptions;
		capture?: (context: ConsentContextValue) => void;
		noStyle?: boolean;
	} = $props();
</script>

<InthProvider {options}>
	{#if capture}<Reader {capture} />{/if}
	<ConsentWidget {noStyle} />
</InthProvider>
