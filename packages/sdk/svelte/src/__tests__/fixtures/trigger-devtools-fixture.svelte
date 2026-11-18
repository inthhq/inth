<script lang="ts">
	import type { CornerPosition } from '@inth/sdk/ui/utils';

	import ConsentProvider from '../../lib/components/consent-provider.svelte';
	import ConsentDialogTrigger from '../../lib/components/panel-trigger.svelte';
	import ConsentDevToolsComponent from '../../lib/devtools';
	import { testOffline } from '../test-offline';

	let {
		devTools = true,
		trigger = true,
		showWhen = 'always',
		defaultPosition = 'bottom-right',
	}: {
		devTools?: boolean;
		trigger?: boolean;
		showWhen?: 'always' | 'after-consent' | 'never';
		defaultPosition?: CornerPosition;
	} = $props();
</script>

<ConsentProvider options={{ mode: testOffline() }}>
	{#if devTools}
		<ConsentDevToolsComponent />
	{/if}
	{#if trigger}
		<ConsentDialogTrigger
			{defaultPosition}
			{showWhen}
			persistPosition={false}
		/>
	{/if}
</ConsentProvider>
