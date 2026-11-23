/**
 * The transport an `<InthProvider>`'s options select: `mode` when it is
 * a factory or a `testing()` value, else the hosted backend at
 * `projectUrl`, which defaults to the URL `consentManifest()` from
 * `@inth/svelte/vite` read.
 *
 * Only the single-page provider imports this, so the SvelteKit `InthProvider`'s
 * first load keeps the hosted transport out: it loads it on demand.
 *
 * @packageDocumentation
 * @internal
 */
import type { ProviderTransportFactory } from '@inth/sdk/engine';
import { projectUrl as builtProjectUrl } from '@inth/sdk/generated';
import type { HostedMode } from '@inth/sdk/modes';
import type { ConsentTesting } from '@inth/sdk/testing';
import { hosted } from '@inth/sdk/transports';

/**
 * The transport factory the options select.
 *
 * @param options - The provider's `projectUrl` and `mode`.
 * @returns The factory, or `undefined` when none of them is set and the
 * build set no URL. The runtime then throws, naming the provider.
 * @internal
 */
export const selectedMode = function selectedMode(options: {
	projectUrl?: string;
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
	const projectUrl = options.projectUrl ?? builtProjectUrl;
	return projectUrl === undefined ? undefined : hosted({ projectUrl });
};
