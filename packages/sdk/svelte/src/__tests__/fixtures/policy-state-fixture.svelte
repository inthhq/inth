<script lang="ts">
	import type { Snippet } from 'svelte';

	import Dialog from '../../lib/components/deferred-panel.svelte';
	import Provider from '../../lib/components/inth-provider.svelte';
	import Link from '../../lib/components/panel-link.svelte';
	import Banner from '../../lib/components/prompt/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';
	import type { ConsentContextValue } from '../../lib/get-consent-context.svelte';
	import Reader from './policy-state-reader.svelte';

	let {
		options,
		capture,
		onclick,
	}: {
		options: ConsentManagerOptions;
		capture: (context: ConsentContextValue) => void;
		onclick?: (event: MouseEvent) => void;
	} = $props();
</script>

<Provider {options}>
	<Reader {capture} />
	<Banner />
	<Dialog />
	<Link {onclick}>Privacy settings</Link>
</Provider>
