<script lang="ts">
	import BenchShell from '$lib/bench-shell.svelte';
	import { createBrowserManifestTransport } from '$lib/client-manifest-transport';
	import { benchConsentCategories } from '$lib/fixture';
	import { InthProvider } from '@inth/svelte';

	/** A transport factory that hands the provider `transport`. */
	const customMode = <Transport>(transport: Transport) =>
		Object.assign(() => transport, { kind: 'custom' as const });

	let { children } = $props();
</script>

<InthProvider
	options={{
		mode: customMode(createBrowserManifestTransport()),
		consentCategories: [...benchConsentCategories],
		disableAnimation: true,
		trapFocus: false,
	}}
>
	<BenchShell scenario="client-manifest">
		{@render children()}
	</BenchShell>
</InthProvider>
