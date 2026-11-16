<!--
	@component
	`ConsentProvider` for a runtime its owner created, started and will
	dispose, without the code that creates one. `ConsentProvider` imports
	the consent engine to build a runtime when it is given none, so a
	surface loaded on demand that always hands one in, such as the Astro
	integration's dialog island, downloads the engine with it. This renders
	the same view and context, and loads nothing of the engine.

	@internal
-->
<script lang="ts">
	import type { ConsentRuntime } from '@c15t/core/runtime/provider';
	import type { Snippet } from 'svelte';

	import { resolveProviderOptions } from '../provider-options';
	import type { ProviderOptionsInput } from '../provider-options';
	import ProviderView from './provider-view.svelte';

	let props: {
		/** The runtime to render. Its owner starts and disposes it. */
		runtime: ConsentRuntime;
		options?: ProviderOptionsInput;
		children?: Snippet;
	} = $props();

	const options = $derived(resolveProviderOptions(props));
</script>

<ProviderView
	children={props.children}
	{options}
	runtime={props.runtime}
	preloadMarker=""
/>
