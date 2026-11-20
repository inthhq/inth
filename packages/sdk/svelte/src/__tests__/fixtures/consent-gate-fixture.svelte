<script lang="ts">
	import type { AllConsentNames, ConsentKernel } from '@inth/sdk/engine';

	import ConsentGate from '../../lib/components/consent-gate.svelte';
	import InthProvider from '../../lib/components/inth-provider.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';
	import Capture from './conformance-kernel-capture.svelte';

	let {
		category,
		onKernel,
		options,
	}: {
		category: AllConsentNames;
		onKernel?: (kernel: ConsentKernel) => void;
		options: ConsentManagerOptions;
	} = $props();
</script>

<InthProvider {options}>
	<Capture {onKernel} />
	<ConsentGate {category} />
</InthProvider>
