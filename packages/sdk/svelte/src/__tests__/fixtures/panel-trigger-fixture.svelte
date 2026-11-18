<script lang="ts">
	import { ConsentDialogTrigger } from '../../lib';
	import ConsentProvider from '../../lib/components/consent-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let {
		options,
		showWhen = 'always' as 'always' | 'after-consent' | 'never',
	}: {
		options: ConsentManagerOptions;
		showWhen?: 'always' | 'after-consent' | 'never';
	} = $props();
</script>

<ConsentProvider {options}>
	<ConsentDialogTrigger {showWhen} />
</ConsentProvider>
