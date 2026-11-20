<script lang="ts">
	import type { OptOutLinkVariant } from '@inth/sdk/engine';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
	} from '@inth/svelte';

	import {
		storybookMode,
		storybookOptOutPolicy,
	} from '../../storybook-consent-policy';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './StorybookConsentProvider.svelte';

	let {
		gpc = false,
		optOutLink = 'do-not-sell' as OptOutLinkVariant,
	}: {
		gpc?: boolean;
		optOutLink?: OptOutLinkVariant;
	} = $props();
</script>

<StorybookConsentProvider
	options={{
		...editableConsentOptions,
		mode: storybookMode([storybookOptOutPolicy]),
		overrides: { country: 'US', gpc, region: 'CA' },
		presentation: { optOutLink },
	}}
>
	{#if gpc}
		<ConsentDialogLink right="opt-out" />
	{:else}
		<ConsentBanner disableAnimation />
	{/if}
	<ConsentDialog disableAnimation />
</StorybookConsentProvider>
