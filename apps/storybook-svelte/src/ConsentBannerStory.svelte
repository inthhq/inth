<script lang="ts">
	import type {
		OptOutLinkVariant,
		PromptPosition,
		PromptVariant,
	} from '@inth/sdk/engine';
	import { ConsentBanner, ConsentDialog } from '@inth/svelte';

	import {
		storybookMode,
		storybookPolicy,
	} from '../../storybook-consent-policy';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './StorybookConsentProvider.svelte';

	let {
		includeDialog = false,
		trapFocus = undefined,
		notice = false,
		optOutLink = undefined,
		disableAnimation = undefined,
		variant = undefined,
		position = undefined,
		blocking = undefined,
	}: {
		includeDialog?: boolean;
		trapFocus?: boolean;
		notice?: boolean;
		optOutLink?: OptOutLinkVariant;
		disableAnimation?: boolean;
		variant?: PromptVariant;
		position?: PromptPosition;
		blocking?: boolean;
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
		trapFocus,
		...(notice ? noticeOptions : {}),
	}}
>
	<ConsentBanner
		{disableAnimation}
		{trapFocus}
		{variant}
		{position}
		{blocking}
	/>
	{#if includeDialog || notice}
		<ConsentDialog
			{disableAnimation}
			{trapFocus}
		/>
	{/if}
</StorybookConsentProvider>
