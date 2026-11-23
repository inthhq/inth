<script lang="ts">
	import type { ConsentKernel } from '@inth/sdk/engine';

	import IABConsentDialog from '../../lib/components/iab-panel.svelte';
	import IABConsentBanner from '../../lib/components/iab-prompt.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/consent-manager-options.model';
	import ConformanceKernelCapture from './conformance-kernel-capture.svelte';

	let {
		options,
		banner = true,
		dialog = true,
		open,
		noStyle,
		onKernel,
	}: {
		options: ConsentManagerOptions;
		banner?: boolean;
		dialog?: boolean;
		open?: boolean;
		noStyle?: boolean;
		onKernel?: (kernel: ConsentKernel) => void;
	} = $props();
</script>

<InthProvider {options}>
	<ConformanceKernelCapture {onKernel} />
	{#if banner}
		<IABConsentBanner {noStyle} />
	{/if}
	{#if dialog}
		<IABConsentDialog
			{open}
			{noStyle}
		/>
	{/if}
</InthProvider>

<main data-testid="iab-style-following-content">
	<p>The page after the consent components.</p>
	<button>Continue</button>
</main>
