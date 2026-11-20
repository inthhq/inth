<script lang="ts">
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentDialogTrigger from '../../lib/components/panel-trigger.svelte';
	import ConsentDialog from '../../lib/components/panel.svelte';
	import ConsentBanner from '../../lib/components/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let {
		options,
		showWhen = 'always' as 'always' | 'after-consent' | 'never',
	}: {
		options: ConsentManagerOptions;
		showWhen?: 'always' | 'after-consent' | 'never';
	} = $props();
</script>

<InthProvider {options}>
	<ConsentBanner />
	<ConsentDialog />
	<ConsentDialogTrigger {showWhen} />
</InthProvider>
