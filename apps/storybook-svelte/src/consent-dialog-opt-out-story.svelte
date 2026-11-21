<script lang="ts">
	import { ConsentDialog } from '@inth/svelte';

	import type { ConsentManagerOptions } from '../../../packages/sdk/svelte/src/lib/types';
	import {
		storybookMode,
		storybookOptOutPolicy,
		storybookOptOutPolicyResolution,
		storybookOptOutRecords,
	} from '../../storybook-consent-policy';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './StorybookConsentProvider.svelte';

	type OptOutDialogKind = 'not-opted-out' | 'request' | 'confirmed' | 'gpc';

	const REFERENCE = '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d';

	const { kind }: { kind: OptOutDialogKind } = $props();

	const buildOptions = function buildOptions(
		current: OptOutDialogKind
	): Partial<ConsentManagerOptions> {
		if (current === 'not-opted-out') {
			return {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
				},
				presentation: { optOutLink: 'do-not-sell' },
			};
		}
		if (current === 'gpc') {
			return {
				...editableConsentOptions,
				mode: storybookMode([storybookOptOutPolicy]),
				overrides: { country: 'US', gpc: true, region: 'CA' },
				prefetch: {
					initialPolicyResolution: storybookOptOutPolicyResolution,
					initialPrivacySignals: { gpc: true },
					initialRecords: storybookOptOutRecords('gpc'),
				},
				presentation: { optOutLink: 'privacy-choices' },
			};
		}
		return {
			...editableConsentOptions,
			mode: storybookMode([storybookOptOutPolicy]),
			overrides: { country: 'US', gpc: false, region: 'CA' },
			prefetch: {
				initialPolicyResolution: storybookOptOutPolicyResolution,
				initialRecords: {
					...storybookOptOutRecords('request'),
					optOutReference: REFERENCE,
					optOutRightsConfirmed: current === 'confirmed',
				},
			},
			presentation: { optOutLink: 'do-not-sell' },
		};
	};

	const options = $derived(buildOptions(kind));
</script>

<StorybookConsentProvider {options}>
	<ConsentDialog
		disableAnimation
		open
	/>
</StorybookConsentProvider>
