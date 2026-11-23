<script lang="ts">
	import { ConsentDialog, ConsentDialogTrigger } from '@inth/svelte';

	import {
		editableConsentOptions,
		editableStoredConsent,
	} from './storybook-consent-fixtures';
	import StorybookConsentProvider from './storybook-consent-provider.svelte';

	let {
		defaultPosition = 'bottom-right',
		size = 'md',
		showWhen = 'always',
	}: {
		defaultPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
		size?: 'sm' | 'md' | 'lg';
		showWhen?: 'always' | 'after-consent' | 'never';
	} = $props();
</script>

<StorybookConsentProvider
	options={editableConsentOptions}
	storedConsent={editableStoredConsent}
>
	<ConsentDialog />
	<ConsentDialogTrigger
		{defaultPosition}
		{showWhen}
		{size}
	/>
</StorybookConsentProvider>
