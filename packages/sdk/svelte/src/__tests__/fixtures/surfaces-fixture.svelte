<script lang="ts">
	import DialogLink from '../../lib/components/consent-dialog-link.svelte';
	import Dialog from '../../lib/components/deferred-panel.svelte';
	import Provider from '../../lib/components/inth-provider.svelte';
	import Trigger from '../../lib/components/panel-trigger.svelte';
	import Widget from '../../lib/components/preferences.svelte';
	import Banner from '../../lib/components/prompt/prompt.svelte';
	import type { ConsentContextValue } from '../../lib/consent-context.model';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';
	import Reader from './policy-state-reader.svelte';

	let {
		options,
		capture,
	}: {
		options: ConsentManagerOptions;
		capture: (context: ConsentContextValue) => void;
	} = $props();
</script>

<!-- Every Inth surface mounted at once, the way a host layout would. -->
<Provider {options}>
	<Reader {capture} />
	<Banner />
	<Dialog />
	<Trigger />
	<DialogLink>Privacy settings</DialogLink>
	<Widget />
</Provider>
