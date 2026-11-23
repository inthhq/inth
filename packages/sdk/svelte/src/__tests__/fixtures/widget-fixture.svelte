<script lang="ts">
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentWidget from '../../lib/components/preferences.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';
	import type { ConsentContextValue } from '../../lib/get-consent-context.svelte';
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
