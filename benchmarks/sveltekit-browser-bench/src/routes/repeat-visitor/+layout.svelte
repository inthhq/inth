<script lang="ts">
	import BenchShell from '$lib/bench-shell.svelte';
	import { benchConsentCategories } from '$lib/fixture';
	import { InthProvider } from '@inth/svelte/kit';

	let { children, data } = $props();
</script>

<InthProvider
	state={data.consent}
	consentCategories={[...benchConsentCategories]}
	disableAnimation={true}
	trapFocus={false}
>
	<BenchShell scenario="repeat-visitor">
		{@render children()}
	</BenchShell>
</InthProvider>
