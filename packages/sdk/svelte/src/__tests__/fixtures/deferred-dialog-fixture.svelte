<script lang="ts">
	import { ConsentBanner, ConsentDialog, ConsentDialogLink } from '../../lib';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let { options }: { options: ConsentManagerOptions } = $props();
</script>

<InthProvider {options}>
	<ConsentBanner />
	<ConsentDialog />
	<ConsentDialogLink>Privacy settings</ConsentDialogLink>
</InthProvider>
