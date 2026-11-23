<script lang="ts">
	import type { OptOutLinkVariant } from '@inth/sdk/engine';
	import { ConsentBanner, ConsentDialog } from '@inth/svelte';

	import {
		storybookMode,
		storybookPolicy,
	} from '../../storybook-consent-policy';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './StorybookConsentProvider.svelte';

	let {
		includeDialog = false,
		blockUntilChoice = undefined,
		notice = false,
		optOutLink = undefined,
		disableAnimation = undefined,
	}: {
		includeDialog?: boolean;
		blockUntilChoice?: boolean;
		notice?: boolean;
		optOutLink?: OptOutLinkVariant;
		disableAnimation?: boolean;
	} = $props();

	// A notice under an opt-out model: an opt-out link plus a primary OK.
	const noticeOptions = $derived({
		mode: storybookMode([
			{
				...storybookPolicy,
				id: 'storybook-notice',
				model: 'opt-out' as const,
				prompt: 'notice' as const,
			},
		]),
		presentation: optOutLink ? { optOutLink } : undefined,
	});
</script>

<StorybookConsentProvider
	options={{
		...editableConsentOptions,
		...(notice ? noticeOptions : {}),
	}}
>
	<ConsentBanner
		{disableAnimation}
		{blockUntilChoice}
	/>
	{#if includeDialog || notice}
		<ConsentDialog {disableAnimation} />
	{/if}
</StorybookConsentProvider>
