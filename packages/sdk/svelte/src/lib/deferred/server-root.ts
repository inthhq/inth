/**
 * The SvelteKit `InthProvider`'s server render: the engine it renders with and
 * the boot data it leaves for the browser.
 *
 * `InthProvider` imports it as `#server-root`, which the package's
 * `imports` map resolves to `server-root-browser.ts` in a browser build.
 * A static import of the engine's modules from the component, even one
 * only a server branch uses, would put the browser's engine chunk on the
 * first load: Rolldown (Vite 8) assigns chunks before it drops the dead
 * branch, so the first-load chunk keeps an import of the modules it shares
 * with the engine chunk.
 *
 * @packageDocumentation
 * @internal
 */

import type { ProviderTransportFactory } from '@inth/sdk/engine';
import { clientMode } from '@inth/sdk/runtime/client-mode';
import type {
	ConsentProviderRuntime,
	ConsentProviderRuntimeOptions,
} from '@inth/sdk/runtime/provider';

import { createOwnedRuntime } from '../create-owned-runtime';
import type { InthProviderState } from '../manager-options.model';
import { modulePreloadMarker } from '../module-preload-marker';
import type { ProviderOptionsInput } from '../resolve-provider-options';
import { planServerBoot } from './plan-server-boot';

/** What a server render of `InthProvider` renders with. @internal */
export interface ServerRoot {
	runtime: ConsentProviderRuntime;
	transport: ProviderTransportFactory;
	/** The boot data's markup. */
	boot: string;
	/** The preload marker: the engine's chunk unless the engine may wait. */
	preloadMarker: string;
}

/**
 * Builds the server's engine and the boot data for one render.
 *
 * @param input.state - `data.consent`.
 * @param input.mode - The root's own transport, if any.
 * @param input.options - The root's options, with its `prefetch`.
 * @param input.runtimeOptions - `runtimeOptionsFor` those options, given
 * the transport.
 * @internal
 */
export const createServerRoot = function createServerRoot(input: {
	state: InthProviderState;
	mode: ProviderTransportFactory | undefined;
	options: ProviderOptionsInput;
	runtimeOptions: (
		transport: ProviderTransportFactory
	) => ConsentProviderRuntimeOptions;
}): ServerRoot {
	const stateMode = input.state.mode;
	// No mode at all is `manifest()`, as in `inthHandle()`.
	const transport = clientMode(
		input.mode ?? stateMode,
		input.state,
		'@inth/svelte/testing'
	);
	const runtime = createOwnedRuntime(input.runtimeOptions(transport));
	const planned = planServerBoot(runtime, input.options);
	return {
		boot: planned.html,
		preloadMarker: planned.defer
			? ''
			: modulePreloadMarker(input.options, { engine: true }),
		runtime,
		transport,
	};
};
