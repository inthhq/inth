<script lang="ts">
	import { ConsentDialog, ConsentDialogLink } from '@inth/svelte';

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
	<div style="padding: 2rem;">
		<ConsentDialogLink noStyle={false}>Privacy preferences</ConsentDialogLink>
		<ConsentDialog />
	</div>
</StorybookConsentProvider>
