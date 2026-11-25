import type { ScriptRegistryWire } from '@inth/sdk-schema/types';

import type { KernelTransport } from '../types';

/**
 * `transport` with an init answer whose script registry is
 * `{ unavailable: true }` given the registry `cached` returns instead, so
 * a runtime that holds no list yet starts from the last one the browser
 * kept. `cached` returns `undefined` when there is none, or when the
 * runtime already holds a list, which the kernel then keeps.
 *
 * @internal
 */
export const withCachedScriptRegistry = function withCachedScriptRegistry(
	transport: KernelTransport,
	cached: () => ScriptRegistryWire | undefined
): KernelTransport {
	const { init } = transport;
	if (!init) {
		return transport;
	}
	return {
		...transport,
		init: async (context) => {
			const response = await init(context);
			if (response.scriptRegistry?.unavailable !== true) {
				return response;
			}
			const registry = cached();
			return registry && registry.unavailable !== true
				? { ...response, scriptRegistry: registry }
				: response;
		},
	};
};
