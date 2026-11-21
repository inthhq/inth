<script lang="ts">
	import type {
		OptOutLinkVariant,
		OptOutPayload,
		OptOutRecord,
		ProviderTransportFactory,
	} from '@inth/sdk/engine';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
	} from '@inth/svelte';

	import type { ConsentManagerOptions } from '../../../packages/sdk/svelte/src/lib/types';
	import {
		storybookMode,
		storybookOptOutPolicy,
		storybookOptOutPolicyResolution,
	} from '../../storybook-consent-policy';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './StorybookConsentProvider.svelte';

	type StoryVariant =
		| 'request'
		| 'confirmed'
		| 'account-covered'
		| 'signal'
		| 'account-adopted';

	let {
		variant = 'request' as StoryVariant,
		optOutLink = 'do-not-sell' as OptOutLinkVariant,
	}: {
		variant?: StoryVariant;
		optOutLink?: OptOutLinkVariant;
	} = $props();

	const optOutAnsweringMode = function optOutAnsweringMode(
		answer: Pick<OptOutRecord, 'heldBy' | 'rights'>
	): ProviderTransportFactory {
		const base = storybookMode([storybookOptOutPolicy]);
		return Object.assign(
			(context: Parameters<ProviderTransportFactory>[0]) => ({
				...base(context),
				optOut: (payload: OptOutPayload) =>
					Promise.resolve({
						ok: true,
						optOut: {
							heldBy: answer.heldBy,
							method: payload.method,
							recordedAt: payload.givenAt,
							rights: [...answer.rights],
						},
						subjectId: payload.subjectId,
					}),
			}),
			{ kind: 'offline' as const }
		);
	};

	const buildOptions = function buildOptions(
		current: StoryVariant,
		link: OptOutLinkVariant
	): Partial<ConsentManagerOptions> {
		const base: Partial<ConsentManagerOptions> = {
			...editableConsentOptions,
			mode: storybookMode([storybookOptOutPolicy]),
			overrides: { country: 'US', gpc: current === 'signal', region: 'CA' },
			presentation: { optOutLink: link },
			reloadOnConsentRevoked: false,
		};
		if (current === 'confirmed') {
			base.mode = optOutAnsweringMode({
				heldBy: 'device',
				rights: ['sale', 'share'],
			});
		} else if (current === 'account-covered') {
			base.mode = optOutAnsweringMode({
				heldBy: 'both',
				rights: ['sale', 'share'],
			});
		} else if (current === 'account-adopted') {
			base.prefetch = {
				initialPolicyResolution: storybookOptOutPolicyResolution,
				initialRecords: {
					optOut: {
						heldBy: 'person',
						method: 'propagated',
						recordedAt: Date.now() - 60_000,
						rights: ['sale', 'share', 'targeted_ads'],
					},
					optOutRightsConfirmed: true,
				},
			};
		}
		return base;
	};

	const showLink = $derived(
		variant === 'signal' || variant === 'account-adopted'
	);
	const options = $derived(buildOptions(variant, optOutLink));
</script>

<StorybookConsentProvider {options}>
	{#if showLink}
		<ConsentDialogLink right="opt-out" />
	{:else}
		<ConsentBanner disableAnimation />
	{/if}
	<ConsentDialog disableAnimation />
</StorybookConsentProvider>
