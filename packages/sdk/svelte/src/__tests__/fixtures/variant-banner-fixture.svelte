<script lang="ts">
	import type { PromptPosition, PromptVariant } from '@inth/sdk/engine';

	import Provider from '../../lib/components/inth-provider.svelte';
	import Dialog from '../../lib/components/panel.svelte';
	import Banner from '../../lib/components/prompt.svelte';
	import type { ConsentManagerOptions } from '../../lib/types';

	let {
		options,
		variant,
		position,
		blocking,
	}: {
		options: ConsentManagerOptions;
		variant?: PromptVariant;
		position?: PromptPosition;
		blocking?: boolean;
	} = $props();
</script>

<Provider {options}>
	<Banner
		{variant}
		{position}
		{blocking}
	/>
	<Dialog />
</Provider>
