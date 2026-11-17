/**
 * `ConsentRoot`'s server render: the engine it renders with and the boot
 * data it leaves for the browser.
 *
 * `ConsentRoot` imports it as `#server-root`, which the package's
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

import type { ProviderTransportFactory } from '@c15t/core';
import { clientMode } from '@c15t/core/runtime/client-mode';
import type {
	ConsentProviderRuntime,
	ConsentProviderRuntimeOptions,
} from '@c15t/core/runtime/provider';

import { modulePreloadMarker } from '../module-preload';
import { createOwnedRuntime } from '../owned-runtime';
import type { ProviderOptionsInput } from '../provider-options';
import type { ConsentRootState } from '../types';
import { planServerBoot } from './boot-server';

/** What a server render of `ConsentRoot` renders with. @internal */
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
 * @returns The runtime, its transport, the boot markup and the marker.
 * @internal
 */
export const createServerRoot = function createServerRoot(input: {
	state: ConsentRootState;
	mode: ProviderTransportFactory | undefined;
	options: ProviderOptionsInput;
	runtimeOptions: (
		transport: ProviderTransportFactory
	) => ConsentProviderRuntimeOptions;
}): ServerRoot {
	const stateMode = input.state.mode;
	// The hosted backend travels as `{ type: 'hosted' }`; `clientMode()`
	// takes it as no mode.
	const transport = clientMode(
		input.mode ?? (stateMode?.type === 'hosted' ? undefined : stateMode),
		input.state,
		'@c15t/svelte/testing'
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
