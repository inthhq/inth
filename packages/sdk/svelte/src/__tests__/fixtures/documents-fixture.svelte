<script lang="ts">
	import type { RuntimeDocuments } from '@inth/sdk/runtime/documents';

	import Provider from '../../lib/components/inth-provider.svelte';
	import type { ConsentContextValue } from '../../lib/context.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';
	import DocumentsReader from './documents-reader.svelte';
	import ContextReader from './policy-state-reader.svelte';

	let {
		options,
		captureContext,
		captureDocuments,
	}: {
		options: ConsentManagerOptions;
		captureContext: (context: ConsentContextValue) => void;
		captureDocuments: (documents: RuntimeDocuments) => void;
	} = $props();
</script>

<Provider {options}>
	<ContextReader capture={captureContext} />
	<DocumentsReader capture={captureDocuments} />
</Provider>
