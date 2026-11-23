<script lang="ts">
	import type { OptOutLinkVariant } from '@inth/sdk/engine';
	import {
		ConsentDialog,
		ConsentDialogLink,
		OptOutConfirmation,
	} from '@inth/svelte';

	import type { ConsentManagerOptions } from '../../../packages/sdk/svelte/src/lib/consent-manager-options.model';
	import {
		storybookMode,
		storybookOptOutConfirmationRecords,
		storybookOptOutPolicy,
		storybookOptOutPolicyResolution,
	} from '../../storybook-consent-policy';
	import type { StorybookOptOutConfirmationKind } from '../../storybook-consent-policy';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './storybook-consent-provider.svelte';

	let {
		variant = 'request' as StorybookOptOutConfirmationKind,
		optOutLink = 'do-not-sell' as OptOutLinkVariant,
	}: {
		variant?: StorybookOptOutConfirmationKind;
		optOutLink?: OptOutLinkVariant;
	} = $props();

	const buildOptions = function buildOptions(
		current: StorybookOptOutConfirmationKind,
		link: OptOutLinkVariant
	): Partial<ConsentManagerOptions> {
		const prefetch: NonNullable<ConsentManagerOptions['prefetch']> = {
			initialPolicyResolution: storybookOptOutPolicyResolution,
			initialRecords: storybookOptOutConfirmationRecords(current),
		};
		if (current === 'signal') {
			prefetch.initialPrivacySignals = { gpc: true };
		}
		return {
			...editableConsentOptions,
			mode: storybookMode([storybookOptOutPolicy]),
			overrides: { country: 'US', gpc: current === 'signal', region: 'CA' },
			prefetch,
			presentation: { optOutLink: link },
			reloadOnConsentRevoked: false,
		};
	};

	const showLink = $derived(
		variant === 'signal' || variant === 'account-adopted'
	);
	const options = $derived(buildOptions(variant, optOutLink));
</script>

<StorybookConsentProvider {options}>
	{#if showLink}
		<ConsentDialogLink right="opt-out" />
		<ConsentDialog disableAnimation />
	{:else}
		<OptOutConfirmation
			disableAnimation
			open
		/>
	{/if}
</StorybookConsentProvider>
