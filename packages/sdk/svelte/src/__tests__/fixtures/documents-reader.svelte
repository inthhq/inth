<script lang="ts">
	import type { RuntimeDocuments } from '@inth/sdk/runtime/documents';
	import { untrack } from 'svelte';

	import { getDocuments } from '../../lib/documents';

	let { capture }: { capture: (documents: RuntimeDocuments) => void } =
		$props();
	untrack(() => capture(getDocuments()));
</script>
