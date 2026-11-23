<script lang="ts">
	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';
	import ActiveUiControl from './active-ui-control.svelte';

	let {
		options,
		open = undefined,
	}: {
		options: ConsentManagerOptions;
		open?: boolean;
	} = $props();
</script>

<InthProvider {options}>
	<ActiveUiControl />
	<ConsentDialog {open} />
</InthProvider>
