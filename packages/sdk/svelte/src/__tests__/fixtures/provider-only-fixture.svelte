<script lang="ts">
	import type { ConsentKernel } from '@inth/sdk/engine';

	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerState } from '../../lib/context.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';
	import ConformanceKernelCapture from './conformance-kernel-capture.svelte';

	let {
		options,
		label = 'child',
		onKernel,
		onManager,
	}: {
		options: ConsentManagerOptions;
		label?: string;
		onKernel?: (kernel: ConsentKernel) => void;
		onManager?: (manager: ConsentManagerState) => void;
	} = $props();
</script>

<InthProvider {options}>
	<ConformanceKernelCapture
		{onKernel}
		{onManager}
	/>
	<div data-testid="render-{label}">{label}</div>
</InthProvider>
