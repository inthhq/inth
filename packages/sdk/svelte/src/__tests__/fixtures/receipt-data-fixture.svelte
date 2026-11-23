<script lang="ts">
	import type { ConsentKernel } from '@inth/sdk/engine';

	import { setConsentContext } from '../../lib/context.svelte';
	import Reader from './receipt-data-reader.svelte';

	/** A consent context around `kernel` alone: the reader needs nothing else. */
	let { kernel }: { kernel: ConsentKernel } = $props();

	setConsentContext(() => kernel, {} as never);
</script>

<Reader />
