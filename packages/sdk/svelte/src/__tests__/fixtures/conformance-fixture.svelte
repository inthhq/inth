<script lang="ts">
	import type { ConsentKernel } from '@inth/sdk/engine';
	import { untrack } from 'svelte';

	import ConsentDialog from '../../lib/components/deferred-panel.svelte';
	import IabConsentDialog from '../../lib/components/iab/iab-panel.svelte';
	import IabConsentBanner from '../../lib/components/iab/iab-prompt.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentWidget from '../../lib/components/preferences.svelte';
	import ConsentBanner from '../../lib/components/prompt/prompt.svelte';
	import type { ConsentManagerState } from '../../lib/consent-context.model';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';
	import ConformanceKernelCapture from './conformance-kernel-capture.svelte';

	type MountableComponent =
		| 'consent-banner'
		| 'consent-dialog'
		| 'consent-widget'
		| 'iab-consent-banner'
		| 'iab-consent-dialog';

	let {
		component,
		options,
		blockUntilChoice = undefined,
		onKernel,
		onManager,
	}: {
		component: MountableComponent;
		options: ConsentManagerOptions;
		/** Make the banner block until a choice. */
		blockUntilChoice?: boolean;
		onKernel?: (kernel: ConsentKernel) => void;
		onManager?: (manager: ConsentManagerState) => void;
	} = $props();
</script>

<InthProvider {options}>
	<ConformanceKernelCapture
		{onKernel}
		{onManager}
	/>
	{#if component === 'consent-banner'}
		<ConsentBanner
			{blockUntilChoice}
			hideBranding
		/>
		<ConsentDialog />
	{:else if component === 'consent-dialog'}
		<ConsentDialog />
	{:else if component === 'consent-widget'}
		<ConsentWidget />
	{:else if component === 'iab-consent-banner'}
		<IabConsentBanner />
	{:else if component === 'iab-consent-dialog'}
		<IabConsentDialog open />
	{/if}
</InthProvider>
