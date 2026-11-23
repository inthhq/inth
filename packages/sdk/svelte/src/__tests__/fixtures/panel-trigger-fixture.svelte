<script lang="ts">
	import { ConsentDialogTrigger } from '../../lib';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/manager-options.model';

	let {
		options,
		showWhen = 'always' as 'always' | 'after-consent' | 'never',
	}: {
		options: ConsentManagerOptions;
		showWhen?: 'always' | 'after-consent' | 'never';
	} = $props();
</script>

<InthProvider {options}>
	<ConsentDialogTrigger {showWhen} />
</InthProvider>
