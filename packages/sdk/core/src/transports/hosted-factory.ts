/**
 * The factory `hosted()` returns, with the transport builder passed in.
 * A module of its own, importing the hosted transport only as a type, so
 * an adapter whose transport is built later (in a chunk that loads on
 * demand) can return the same recognizable factory without shipping the
 * transport with the page.
 *
 * @packageDocumentation
 * @internal
 */

import type { KernelTransport } from '../types';
import type { HostedTransportOptions } from './hosted';
import { hostedFactories } from './hosted-modes';
import type { HostedModeFactory, HostedModeOptions } from './mode';

/**
 * Builds a `hosted()` factory whose transports come from `build`.
 *
 * @param build - Builds the transport from the factory's options.
 * @returns A hosted transport factory carrying its options.
 * @internal
 */
export const createHostedModeFactory = function createHostedModeFactory(
	options: HostedModeOptions,
	build: (transport: HostedTransportOptions) => KernelTransport
): HostedModeFactory {
	// The options as of this call: editing the object afterwards changes
	// neither the transports this factory builds nor what a provider
	// compares them by. `fetch` and `initialData` stay the same values.
	const settings: HostedModeOptions = {
		...options,
		headers: options.headers && { ...options.headers },
	};
	if (settings.headers === undefined) {
		delete settings.headers;
	}
	const mode = Object.assign(
		() =>
			build({
				assertDecisionInputs:
					settings.assertDecisionInputs ?? settings.initUrl !== undefined,
				decisionInputs: settings.decisionInputs,
				domain: settings.domain,
				fetch: settings.fetch,
				headers: settings.headers && { ...settings.headers },
				initUrl: settings.initUrl,
				initialData: settings.initialData,
				projectUrl: settings.projectUrl,
			}),
		settings,
		{ kind: 'hosted' as const, type: 'hosted' as const }
	);
	hostedFactories.add(mode);
	return mode;
};
