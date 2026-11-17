/**
 * The transport a `<ConsentProvider>`'s options select: `mode` when it is
 * a factory or a `testing()` value, else the hosted backend at
 * `backendURL`, which defaults to the URL `consentManifest()` from
 * `c15t/svelte/vite` read.
 *
 * Only the single-page provider imports this, so `ConsentRoot`'s first
 * load keeps the hosted transport out: it loads it on demand.
 *
 * @packageDocumentation
 * @internal
 */
import type { ProviderTransportFactory } from '@c15t/core';
import type { HostedMode } from '@c15t/core/modes';
import { backendURL as builtBackendURL } from '@c15t/core/generated';
import type { ConsentTesting } from '@c15t/core/testing';
import { hosted } from '@c15t/core/transports';

/**
 * The transport factory the options select.
 *
 * @param options - The provider's `backendURL` and `mode`.
 * @returns The factory, or `undefined` when none of them is set and the
 * build set no URL. The runtime then throws, naming the provider.
 * @internal
 */
export const selectedMode = function selectedMode(options: {
	backendURL?: string;
	mode?: ProviderTransportFactory | HostedMode | ConsentTesting;
}): ProviderTransportFactory | undefined {
	const { mode } = options;
	if (typeof mode === 'function') {
		return mode;
	}
	// A `testing()` value carries its transport, not enumerable.
	if (mode && 'transport' in mode && mode.transport) {
		return mode.transport;
	}
	const backendURL = options.backendURL ?? builtBackendURL;
	return backendURL === undefined ? undefined : hosted({ backendURL });
};
