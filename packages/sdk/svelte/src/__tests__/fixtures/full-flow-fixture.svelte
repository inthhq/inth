<script lang="ts">
	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentDialogTrigger from '../../lib/components/panel-trigger.svelte';
	import ConsentBanner from '../../lib/components/prompt/prompt.svelte';
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
	<ConsentBanner />
	<ConsentDialog />
	<ConsentDialogTrigger {showWhen} />
</InthProvider>
