<script lang="ts">
	import BenchShell from '$lib/bench-shell.svelte';
	import { benchConsentCategories } from '$lib/fixture';
	import { ConsentProvider, hosted } from '@inth/svelte';

	let { children } = $props();
</script>

<ConsentProvider
	options={{
		projectUrl: '/api/bench-consent',
		mode: hosted(),
		consentCategories: [...benchConsentCategories],
		disableAnimation: true,
		trapFocus: false,
	}}
>
	<BenchShell scenario="client">
		{@render children()}
	</BenchShell>
</ConsentProvider>
