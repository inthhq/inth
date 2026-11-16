<script lang="ts">
	import { custom } from '@c15t/core';
	import type { KernelConfig } from '@c15t/core';
	import type { Script } from '@c15t/core/modules/script-loader';

	import ConsentRoot from '../../lib/components/consent-root.svelte';
	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import ConsentBanner from '../../lib/components/prompt.svelte';

	let {
		prefetch,
		scripts = [],
	}: { prefetch: KernelConfig; scripts?: Script[] } = $props();
</script>

<ConsentRoot
	consentCategories={['necessary', 'measurement', 'marketing']}
	disableAnimation
	mode={custom({})}
	state={{ mode: { type: 'manifest' }, prefetch }}
	{scripts}
>
	<main>Page</main>
	<ConsentBanner />
	<ConsentDialog />
</ConsentRoot>
