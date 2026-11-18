<script lang="ts">
	import type { KernelConfig } from '@inth/sdk/engine';
	import type { Script } from '@inth/sdk/modules/script-loader';

	import ConsentRoot from '../../lib/components/consent-root.svelte';
	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import ConsentBanner from '../../lib/components/prompt.svelte';
	import { transportMode } from './transport-mode';

	let {
		prefetch,
		scripts = [],
	}: { prefetch: KernelConfig; scripts?: Script[] } = $props();
</script>

<ConsentRoot
	consentCategories={['necessary', 'measurement', 'marketing']}
	disableAnimation
	mode={transportMode({})}
	state={{ mode: { type: 'manifest' }, prefetch }}
	{scripts}
>
	<main>Page</main>
	<ConsentBanner />
	<ConsentDialog />
</ConsentRoot>
