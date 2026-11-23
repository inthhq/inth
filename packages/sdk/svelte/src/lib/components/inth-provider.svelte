<script lang="ts">
	import type { ConsentProviderRuntime } from '@inth/sdk/runtime/provider';
	import { untrack } from 'svelte';

	import type { ConsentManagerOptions } from '../manager-options.model';
	import { createOwnedRuntime } from '../create-owned-runtime';
	import { modulePreloadMarker } from '../module-preload-marker';
	import {
		resolveProviderOptions,
		runtimeOptionsFor,
	} from '../resolve-provider-options';
	import type {
		ProviderOptionsInput,
		ProviderRuntimeProps,
	} from '../resolve-provider-options';
	import { selectedMode } from '../selected-mode';
	import ProviderView from './provider-view.svelte';

	type InthProviderProps =
		| (ConsentManagerOptions &
				ProviderRuntimeProps & {
					options?: ProviderOptionsInput;
				})
		| (ProviderOptionsInput &
				ProviderRuntimeProps & {
					options: ConsentManagerOptions;
				});

	let props: InthProviderProps = $props();

	const options = $derived(resolveProviderOptions(props));

	// The runtime owns the kernel and every side-effecting module. When one
	// is handed in, its owner is also responsible for `start()`/`dispose()`.
	const externalRuntime = untrack(() => props.runtime);
	const ownedRuntime: ConsentProviderRuntime | undefined =
		externalRuntime === undefined
			? untrack(() =>
					createOwnedRuntime(
						runtimeOptionsFor({
							...options,
							mode: selectedMode(options),
						})
					)
				)
			: undefined;
	// Names the on-demand chunks this page starts with, so `inthHandle` can
	// preload them from the server-rendered head. The same on the server and
	// in the browser, so hydration keeps it.
	const preloadMarker = ownedRuntime
		? untrack(() => modulePreloadMarker(options))
		: '';
</script>

<ProviderView
	children={props.children}
	{options}
	runtime={externalRuntime ?? (ownedRuntime as ConsentProviderRuntime)}
	owned={ownedRuntime}
	{preloadMarker}
/>
