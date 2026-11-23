<script lang="ts">
	import { ConsentWidget } from '@inth/svelte';

	import {
		editableConsentOptions,
		editableStoredConsent,
	} from './storybook-consent-fixtures';
	import StorybookConsentProvider from './storybook-consent-provider.svelte';
</script>

<StorybookConsentProvider
	options={editableConsentOptions}
	storedConsent={editableStoredConsent}
>
	<div style="width: 32rem;">
		<ConsentWidget />
	</div>
</StorybookConsentProvider>
