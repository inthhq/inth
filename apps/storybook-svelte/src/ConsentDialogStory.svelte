<script lang="ts">
	import {
		ConsentBanner,
		ConsentDialog,
		PrivacyChoicesLink,
	} from '@inth/svelte';

	import {
		editableConsentOptions,
		editableStoredConsent,
	} from './storybook-consent-fixtures';
	import StorybookConsentProvider from './StorybookConsentProvider.svelte';

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
		<!-- The page's "Your Privacy Choices" link opens the dialog. -->
		<PrivacyChoicesLink />
		<ConsentBanner />
	{/if}
	<ConsentDialog {open} />
</StorybookConsentProvider>
