<!--
	@component
	The SvelteKit root: renders the consent provider from the state
	`loadConsent` returned, so the banner is in the server HTML.

	```svelte
	<script lang="ts">
		import { ConsentBanner, ConsentRoot } from '@c15t/svelte';

		let { children, data } = $props();
	</script>

	<ConsentRoot state={data.consent}>
		{@render children()}
		<ConsentBanner />
	</ConsentRoot>
	```

	The state names the mode `c15tHandle()` was given, as data. The root
	turns it into a transport that loads each init path only when it runs:
	a page the server resolved saves through a small record transport and
	ships no resolver, policy pack, snapshot or other language.

	The consent engine is not in the browser's first-load JavaScript. The
	server render leaves the snapshot it rendered with after the children;
	the browser hydrates from it, and components read it until the engine
	loads. For a visitor the banner asks to choose, the engine loads after
	the page's priority images, at the first input or scroll outside the
	banner, or when page code needs it; an Accept or Reject before then is
	recorded in the tap's own task. Every other visitor's engine loads at
	once, and the server render preloads it. A render without server HTML
	(`ssr = false`) renders the children once the engine has loaded.
-->
<script lang="ts">
	import type { ProviderTransportFactory } from '@c15t/core';
	import type { ConsentProviderRuntime } from '@c15t/core/runtime/provider';
	import { BROWSER } from 'esm-env';
	import type { Snippet } from 'svelte';
	import { onDestroy, untrack } from 'svelte';

	// A stand-in in the browser build: see `../deferred/server-root.ts`.
	import { createServerRoot } from '#server-root';

	import { readConsentBoot } from '../deferred/boot';
	import { createDeferredRuntime } from '../deferred/runtime';
	import type { EngineFactory } from '../deferred/runtime';
	import { modulePreloadMarker } from '../module-preload';
	import {
		resolveProviderOptions,
		runtimeOptionsFor,
	} from '../provider-options';
	import type { ProviderOptionsInput } from '../provider-options';
	import type { ConsentManagerOptions, ConsentRootState } from '../types';
	import ProviderView from './provider-view.svelte';

	type ConsentRootProps = Omit<ConsentManagerOptions, 'mode' | 'prefetch'> & {
		children?: Snippet;
		/**
		 * A transport of your own, instead of the mode `c15tHandle()` was given. Read once, when the
		 * root mounts.
		 */
		mode?: ProviderTransportFactory;
		/** `data.consent`, from `loadConsent` in `+layout.server.ts`. */
		state: ConsentRootState;
	};

	let props: ConsentRootProps = $props();

	// The transport is built once, when the root mounts, like
	// `ConsentProvider`'s `mode`. In the browser the engine builds it.
	let transport = $state.raw<ProviderTransportFactory | undefined>();
	const options = $derived.by((): ProviderOptionsInput => {
		const { mode: _mode, state, ...rest } = props;
		return {
			...resolveProviderOptions(rest),
			mode: transport,
			prefetch: state.prefetch,
		};
	});
	const readOptions = () => untrack(() => options);
	const readRuntimeOptions = () => runtimeOptionsFor(readOptions());

	/** What this render starts with. */
	interface RootPlan {
		runtime?: ConsentProviderRuntime;
		/** The boot data's markup, rendered after the children. */
		boot: string;
		preloadMarker: string;
	}

	/** Loads the engine chunk, for the browser. */
	const loadEngine = async (): Promise<EngineFactory> => {
		const engine = await import('../deferred/engine');
		return (committed) => {
			const built = engine.createRootEngine({
				committed,
				mode: untrack(() => props.mode),
				options: readRuntimeOptions(),
				state: untrack(() => props.state),
			});
			return {
				preloadSavePath: engine.preloadSavePath,
				runtime: built.runtime,
				updateOptions: (next) => ({ ...next, mode: built.transport }),
			};
		};
	};

	const planRoot = (): RootPlan => {
		if (!BROWSER) {
			// The server renders with the engine, and leaves the snapshot it
			// rendered with for the browser.
			const server = createServerRoot({
				mode: props.mode,
				options: readOptions(),
				runtimeOptions: (built) =>
					runtimeOptionsFor({ ...readOptions(), mode: built }),
				state: props.state,
			});
			({ transport } = server);
			return {
				boot: server.boot,
				preloadMarker: server.preloadMarker,
				runtime: server.runtime,
			};
		}
		const read = readConsentBoot(props.state.prefetch.initialIab?.gvl);
		if (!read) {
			return { boot: '', preloadMarker: '' };
		}
		return {
			boot: read.html,
			preloadMarker: read.boot.d
				? ''
				: modulePreloadMarker(readOptions(), { engine: true }),
			runtime: createDeferredRuntime({
				boot: read.boot,
				loadEngine,
				options: readOptions,
			}),
		};
	};

	const plan = untrack(planRoot);
	let runtime = $state.raw(plan.runtime);

	if (!plan.runtime) {
		// No server HTML to hydrate: render once the engine is in.
		let active = true;
		onDestroy(() => {
			active = false;
		});
		void (async () => {
			const engine = await import('../deferred/engine');
			if (!active) {
				return;
			}
			const built = engine.createRootEngine({
				mode: untrack(() => props.mode),
				options: readRuntimeOptions(),
				state: untrack(() => props.state),
			});
			({ runtime, transport } = built);
		})();
	}
</script>

{#if runtime}
	<ProviderView
		children={props.children}
		{options}
		{runtime}
		owned={runtime}
		preloadMarker={plan.preloadMarker}
		boot={plan.boot}
	/>
{/if}
