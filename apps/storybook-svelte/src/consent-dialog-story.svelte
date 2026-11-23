<script lang="ts">
	import { ConsentBanner, ConsentDialog } from '@inth/svelte';

	import {
		editableConsentOptions,
		editableStoredConsent,
	} from './storybook-consent-fixtures';
	import StorybookConsentProvider from './storybook-consent-provider.svelte';

	let {
		open = undefined,
		withBanner = false,
		useStoredConsent = false,
	}: {
		open?: boolean;
		withBanner?: boolean;
		useStoredConsent?: boolean;
	} = $props();
</script>

<StorybookConsentProvider
	options={editableConsentOptions}
	storedConsent={useStoredConsent ? editableStoredConsent : undefined}
>
	{#if withBanner}
		<ConsentBanner />
	{/if}
	<ConsentDialog {open} />
</StorybookConsentProvider>
