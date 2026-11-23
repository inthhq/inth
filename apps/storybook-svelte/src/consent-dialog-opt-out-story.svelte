<script lang="ts">
	import { ConsentDialog } from '@inth/svelte';

	import type { ConsentManagerOptions } from '../../../packages/sdk/svelte/src/lib/manager-options.model';
	import {
		STORYBOOK_OPT_OUT_REFERENCE,
		storybookMode,
		storybookOptOutPolicy,
		storybookOptOutPolicyResolution,
		storybookOptOutRecords,
	} from '../../storybook-consent-policy';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './storybook-consent-provider.svelte';

	type OptOutDialogKind = 'not-opted-out' | 'request' | 'confirmed' | 'gpc';

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
					optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
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
