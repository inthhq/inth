<script lang="ts">
	import {
		devToolsProviderOptions,
		getDevToolsCategories,
	} from '@inth/conformance/fixtures/devtools';
	import { InthProvider } from '@inth/svelte';

	import { DevTools } from '../../../packages/sdk/svelte/src/lib/devtools';
</script>

<InthProvider options={devToolsProviderOptions}>
	<DevTools
		defaultOpen
		getConsentCategories={getDevToolsCategories}
	/>
</InthProvider>
