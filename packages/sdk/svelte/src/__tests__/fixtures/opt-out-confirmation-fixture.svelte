<script lang="ts">
	import type { ConsentContextValue } from '../../lib/context.svelte';
	import {
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		ConsentDialogTrigger,
		InthProvider,
		OptOutConfirmation,
	} from '../../lib/index';
	import type { ConsentManagerOptions } from '../../lib/types';
	import Reader from './policy-state-reader.svelte';

	let {
		options,
		capture,
		showBanner = true,
		showDialog = true,
		showLink = false,
		showTrigger = false,
		showStandaloneConfirmation = false,
	}: {
		options: ConsentManagerOptions;
		capture: (context: ConsentContextValue) => void;
		showBanner?: boolean;
		showDialog?: boolean;
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
		<ConsentDialog disableAnimation />
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
