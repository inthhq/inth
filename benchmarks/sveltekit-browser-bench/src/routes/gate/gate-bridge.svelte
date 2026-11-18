<script lang="ts">
	/**
	 * Publishes the kernel snapshot to the gate bridge, as CookieBench's
	 * `lib/bridge.svelte` does with its `updateBridge`.
	 */
	import { updateGateBridge } from '@c15t/benchmarking/consent-gate-page';
	import { getConsentKernel } from '@inth/svelte';
	import { onMount } from 'svelte';

	const kernel = getConsentKernel();
	onMount(() => {
		updateGateBridge(kernel.getSnapshot());
		return kernel.subscribe(updateGateBridge);
	});
</script>
