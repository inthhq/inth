<script lang="ts">
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentDialog from '../../lib/components/panel.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';
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
