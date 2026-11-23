import type { ConsentKernel } from '../consent-kernel.model';
/**
 * `streamPrefetch`: a streamed `prefetch` with its resolver imported
 * statically. See `streamed-init.ts` for what the first `init()` does with
 * the resolved config, and `create-streamed-mode.ts` for the on-demand variant.
 */
import type { ProviderTransportFactory } from '../transports/mode';
import type {
	ConsentProviderRuntimeOptions,
	RuntimePrefetch,
} from './consent-runtime.model';
import { createStreamedMode } from './create-streamed-mode';
import { resolveStreamedInit } from './streamed-init';

/**
 * Wrap a `mode` factory so its transport's first `init()` is answered by a
 * prefetch promise. The transport context reports the resolved config from
 * then on, so a transport that reads it at init time (offline's detected
 * `Accept-Language`) sees the server's values rather than the placeholder.
 *
 * Pass it as `streamPrefetch` in `createConsentProviderRuntime`'s modules to
 * accept a `prefetch` that is still a promise. `lazyStreamPrefetch` from
 * `@inth/sdk/runtime/provider` does the same and loads this code only for
 * a runtime whose prefetch is a promise.
 *
 * @param options - The runtime's `overrides` and `experiment`.
 * @param getKernel - The kernel being initialized, once it exists.
 * @returns A transport factory of the same kind.
 */
export const streamPrefetch = function streamPrefetch(
	mode: ProviderTransportFactory,
	prefetch: PromiseLike<RuntimePrefetch>,
	options: Pick<ConsentProviderRuntimeOptions, 'experiment' | 'overrides'>,
	getKernel: () => ConsentKernel | undefined
): ProviderTransportFactory {
	return createStreamedMode(
		mode,
		prefetch,
		options,
		getKernel,
		() => resolveStreamedInit
	);
};
