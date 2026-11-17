<script lang="ts">
	import type { ConsentProviderRuntime } from '@c15t/core/runtime/provider';
	import { untrack } from 'svelte';

	import { modulePreloadMarker } from '../module-preload';
	import { createOwnedRuntime } from '../owned-runtime';
	import {
		resolveProviderOptions,
		runtimeOptionsFor,
	} from '../provider-options';
	import type {
		ProviderOptionsInput,
		ProviderRuntimeProps,
	} from '../provider-options';
	import { selectedMode } from '../select-mode';
	import type { ConsentManagerOptions } from '../types';
	import ProviderView from './provider-view.svelte';

	type ConsentProviderProps =
		| (ConsentManagerOptions &
				ProviderRuntimeProps & {
					options?: ProviderOptionsInput;
				})
		| (ProviderOptionsInput &
				ProviderRuntimeProps & {
					options: ConsentManagerOptions;
				});

	let props: ConsentProviderProps = $props();

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
							// `mode` is the transport the testing value selected.
							testing: undefined,
						})
					)
				)
			: undefined;
	// Names the on-demand chunks this page starts with, so `c15tHandle` can
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
