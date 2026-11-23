<script lang="ts">
	import ConsentDialogLink from '../../lib/components/consent-dialog-link.svelte';
	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';

	let {
		options,
		right,
		styled = false,
	}: {
		options: ConsentManagerOptions;
		right?: 'opt-out' | 'preferences';
		styled?: boolean;
	} = $props();
</script>

<InthProvider {options}>
	<ConsentDialogLink
		noStyle={!styled}
		{right}>Manage Preferences</ConsentDialogLink
	>
	<ConsentDialog />
</InthProvider>
