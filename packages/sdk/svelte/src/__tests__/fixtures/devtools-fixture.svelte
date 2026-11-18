<script lang="ts">
	import { resolvePolicyRules } from '@inth/sdk/schema/types';

	import ConsentProvider from '../../lib/components/consent-provider.svelte';
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
		clearRecords?: import('../../lib/devtools-options').ConsentDevToolsProps['clearRecords'];
		getPresentation?: import('../../lib/devtools-options').ConsentDevToolsProps['getPresentation'];
		presentation?: import('@inth/sdk/engine').ConsentPresentation;
		storageKey?: string;
		getConsentCategories?: import('../../lib/devtools-options').ConsentDevToolsProps['getConsentCategories'];
		multiple?: boolean;
		policyCategories?: import('@inth/sdk/engine').AllConsentNames[];
		position?: import('../../lib/devtools-options').ConsentDevToolsProps['position'];
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

<ConsentProvider
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
</ConsentProvider>

{#if multiple}
	<ConsentProvider options={{ mode: testing() }}>
		<ConsentDevToolsComponent position="bottom-right" />
	</ConsentProvider>
{/if}
