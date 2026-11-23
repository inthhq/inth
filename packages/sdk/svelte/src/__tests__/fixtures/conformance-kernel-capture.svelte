<script lang="ts">
	import type { ConsentKernel } from '@inth/sdk/engine';
	import { untrack } from 'svelte';

	import {
		getConsentKernel,
		getConsentManager,
	} from '../../lib/get-headless-consent';
	import type { ConsentManagerState } from '../../lib/consent-context.model';

	let {
		onKernel,
		onManager,
	}: {
		onKernel?: (kernel: ConsentKernel) => void;
		onManager?: (manager: ConsentManagerState) => void;
	} = $props();

	const kernel = getConsentKernel();
	const manager = getConsentManager();
	untrack(() => {
		onKernel?.(kernel);
		onManager?.(manager);
	});
</script>
