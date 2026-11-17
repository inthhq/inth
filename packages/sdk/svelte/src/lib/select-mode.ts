/**
 * The transport a `<ConsentProvider>`'s options select: the `testing`
 * value's, then `mode`, then the hosted backend at `backendURL`, which
 * defaults to the URL `consentManifest()` from `c15t/svelte/vite` read.
 *
 * Only the single-page provider imports this, so `ConsentRoot`'s first
 * load keeps the hosted transport out: it loads it on demand.
 *
 * @packageDocumentation
 * @internal
 */
import type { ProviderTransportFactory } from '@c15t/core';
import { backendURL as builtBackendURL } from '@c15t/core/generated';
import type { ConsentTesting } from '@c15t/core/testing';
import { hosted } from '@c15t/core/transports';

/**
 * The transport factory the options select.
 *
 * @param options - The provider's `backendURL`, `mode` and `testing`.
 * @returns The factory, or `undefined` when none of them is set and the
 * build set no URL. The runtime then throws, naming the provider.
 * @internal
 */
export const selectedMode = function selectedMode(options: {
	backendURL?: string;
	mode?: ProviderTransportFactory;
	testing?: ConsentTesting;
}): ProviderTransportFactory | undefined {
	// A testing value that crossed a serialization boundary is data only;
	// the browser side builds its transport.
	if (options.testing?.transport) {
		return options.testing.transport;
	}
	if (options.mode) {
		return options.mode;
	}
	const backendURL = options.backendURL ?? builtBackendURL;
	return backendURL === undefined ? undefined : hosted({ backendURL });
};
