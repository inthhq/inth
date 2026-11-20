<script lang="ts">
	import { ConsentWidget } from '@inth/svelte';

	import {
		storybookMode,
		storybookOptOutPolicy,
		storybookOptOutPolicyResolution,
		storybookOptOutRecords,
	} from '../../storybook-consent-policy';
	import { editableConsentOptions } from './storybook-consent-fixtures';
	import StorybookConsentProvider from './StorybookConsentProvider.svelte';

	const { kind }: { kind: 'request' | 'gpc' | 'account' } = $props();
</script>

<StorybookConsentProvider
	options={{
		...editableConsentOptions,
		mode: storybookMode([storybookOptOutPolicy]),
		...(kind === 'gpc' ? { overrides: { gpc: true } } : {}),
		prefetch: {
			initialPolicyResolution: storybookOptOutPolicyResolution,
			...(kind === 'gpc' ? { initialPrivacySignals: { gpc: true } } : {}),
			initialRecords: storybookOptOutRecords(kind),
		},
	}}
>
	<div style="width: 32rem;">
		<ConsentWidget />
	</div>
</StorybookConsentProvider>
