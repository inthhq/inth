<script lang="ts">
	import { untrack } from 'svelte';

	import { getConsentContext } from '../../lib/get-consent-context.svelte';
	import type { ConsentContextValue } from '../../lib/consent-context.model';

	let { capture }: { capture: (context: ConsentContextValue) => void } =
		$props();
	const context = getConsentContext();
	untrack(() => capture(context));
</script>
