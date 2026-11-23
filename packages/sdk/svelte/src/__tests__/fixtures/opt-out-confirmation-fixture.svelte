<script lang="ts">
	import type { ConsentContextValue } from '../../lib/consent-context.model';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		ConsentDialogTrigger,
		ConsentWidget,
		InthProvider,
		OptOutConfirmation,
	} from '../../lib/index';
	import type { ConsentManagerOptions } from '../../lib/manager-options.model';
	import Reader from './policy-state-reader.svelte';

	let {
		options,
		capture,
		showBanner = true,
		showDialog = true,
		dialogOpen = undefined,
		showWidget = false,
		showLink = false,
		showTrigger = false,
		showStandaloneConfirmation = false,
	}: {
		options: ConsentManagerOptions;
		capture: (context: ConsentContextValue) => void;
		showBanner?: boolean;
		showDialog?: boolean;
		dialogOpen?: boolean;
		showWidget?: boolean;
		showLink?: boolean;
		showTrigger?: boolean;
		showStandaloneConfirmation?: boolean;
	} = $props();
</script>

<InthProvider {options}>
	<Reader {capture} />
	{#if showBanner}
		<ConsentBanner disableAnimation />
	{/if}
	{#if showDialog}
		<ConsentDialog
			disableAnimation
			open={dialogOpen}
		/>
	{/if}
	{#if showWidget}
		<ConsentWidget />
	{/if}
	{#if showLink}
		<ConsentDialogLink right="opt-out" />
	{/if}
	{#if showTrigger}
		<ConsentDialogTrigger showWhen="always" />
	{/if}
	{#if showStandaloneConfirmation}
		<OptOutConfirmation disableAnimation />
	{/if}
</InthProvider>
