<script lang="ts">
	import { resolvePolicyRules } from '@inth/sdk/schema/types';

	import InthProvider from '../../lib/components/inth-provider.svelte';
	import ConsentDevToolsComponent from '../../lib/devtools';
	import { testing } from '../../lib/testing';

	let {
		categories,
		clearRecords,
		getPresentation,
		presentation,
		storageKey,
		getConsentCategories,
		multiple = false,
		policyCategories,
		position = 'top-left',
		shadow,
	}: {
		categories?: import('@inth/sdk/engine').AllConsentNames[];
		clearRecords?: import('../../lib/devtools-options.model').ConsentDevToolsProps['clearRecords'];
		getPresentation?: import('../../lib/devtools-options.model').ConsentDevToolsProps['getPresentation'];
		presentation?: import('@inth/sdk/engine').ConsentPresentation;
		storageKey?: string;
		getConsentCategories?: import('../../lib/devtools-options.model').ConsentDevToolsProps['getConsentCategories'];
		multiple?: boolean;
		policyCategories?: import('@inth/sdk/engine').AllConsentNames[];
		position?: import('../../lib/devtools-options.model').ConsentDevToolsProps['position'];
		shadow?: boolean;
	} = $props();
	const resolution = $derived.by(() => {
		if (!policyCategories) {
			return undefined;
		}
		const resolved = resolvePolicyRules({
			countryCode: null,
			regionCode: null,
			rules: [
				{
					categories: policyCategories,
					id: 'devtools-fixture',
					match: { isDefault: true },
					model: 'opt-in',
					prompt: 'choice',
					scopeMode: 'permissive',
				},
			],
		});
		if (resolved.status !== 'matched') {
			throw new Error('Devtools fixture policy must resolve');
		}
		return resolved;
	});
</script>

<InthProvider
	options={{
		mode: testing(),
		consentCategories: categories,
		presentation,
		storageConfig: storageKey ? { storageKey } : undefined,
		prefetch: resolution ? { initialPolicyResolution: resolution } : undefined,
	}}
>
	<ConsentDevToolsComponent
		{clearRecords}
		{getPresentation}
		{position}
		{getConsentCategories}
		{shadow}
		defaultOpen
	/>
</InthProvider>

{#if multiple}
	<InthProvider options={{ mode: testing() }}>
		<ConsentDevToolsComponent position="bottom-right" />
	</InthProvider>
{/if}
