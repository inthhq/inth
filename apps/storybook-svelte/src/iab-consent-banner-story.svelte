<script lang="ts">
	import { IABConsentBanner, IABConsentDialog } from '@inth/svelte';

	import StorybookIABProvider from './storybook-iab-provider.svelte';

	let { includeDialog = false }: { includeDialog?: boolean } = $props();
</script>

<StorybookIABProvider>
	<IABConsentBanner />
	{#if includeDialog}
		<IABConsentDialog />
	{/if}
</StorybookIABProvider>
