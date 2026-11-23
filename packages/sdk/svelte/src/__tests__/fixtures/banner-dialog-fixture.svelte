<script lang="ts">
	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentBanner from '../../lib/components/prompt/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';

	let { options }: { options: ConsentManagerOptions } = $props();
</script>

<InthProvider {options}>
	<ConsentBanner />
	<ConsentDialog />
</InthProvider>
