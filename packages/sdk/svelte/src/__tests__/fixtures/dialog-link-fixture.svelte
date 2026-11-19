<script lang="ts">
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentDialogLink from '../../lib/components/panel-link.svelte';
	import ConsentDialog from '../../lib/components/panel.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let {
		options,
		styled = false,
	}: { options: ConsentManagerOptions; styled?: boolean } = $props();
</script>

<InthProvider {options}>
	<ConsentDialogLink noStyle={!styled}>Manage Preferences</ConsentDialogLink>
	<ConsentDialog />
</InthProvider>
