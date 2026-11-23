<script lang="ts">
	import { ConsentWidget } from '@inth/svelte';

	import type { ConsentManagerOptions } from '../../../packages/sdk/svelte/src/lib/consent-manager-options.model';
	import {
		STORYBOOK_OPT_OUT_REFERENCE,
		storybookMode,
		storybookOptOutPolicy,
		storybookOptOutPolicyResolution,
		storybookOptOutRecords,
	} from '../../storybook-consent-policy';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './storybook-consent-provider.svelte';

	type OptOutWidgetKind =
		| 'not-opted-out'
		| 'request'
		| 'confirmed'
		| 'gpc'
		| 'account';

	const { kind }: { kind: OptOutWidgetKind } = $props();

	const buildOptions = function buildOptions(
		current: OptOutWidgetKind
	): Partial<ConsentManagerOptions> {
		const base: Partial<ConsentManagerOptions> = {
			...editableConsentOptions,
			mode: storybookMode([storybookOptOutPolicy]),
			prefetch: {
				initialPolicyResolution: storybookOptOutPolicyResolution,
			},
		};
		if (current === 'not-opted-out') {
			base.overrides = { country: 'US', gpc: false, region: 'CA' };
			base.presentation = { optOutLink: 'do-not-sell' };
			return base;
		}
		if (current === 'request' || current === 'confirmed') {
			base.overrides = { country: 'US', gpc: false, region: 'CA' };
			base.presentation = { optOutLink: 'do-not-sell' };
			base.prefetch = {
				initialPolicyResolution: storybookOptOutPolicyResolution,
				initialRecords: {
					...storybookOptOutRecords('request'),
					optOutReference: STORYBOOK_OPT_OUT_REFERENCE,
					optOutRightsConfirmed: current === 'confirmed',
				},
			};
			return base;
		}
		if (current === 'gpc') {
			base.overrides = { gpc: true };
			base.prefetch = {
				initialPolicyResolution: storybookOptOutPolicyResolution,
				initialPrivacySignals: { gpc: true },
				initialRecords: storybookOptOutRecords('gpc'),
			};
			return base;
		}
		base.prefetch = {
			initialPolicyResolution: storybookOptOutPolicyResolution,
			initialRecords: storybookOptOutRecords('account'),
		};
		return base;
	};

	const options = $derived(buildOptions(kind));
</script>

<StorybookConsentProvider {options}>
	<div style="width: 32rem;">
		<ConsentWidget />
	</div>
</StorybookConsentProvider>
