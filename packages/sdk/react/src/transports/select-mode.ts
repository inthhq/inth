/**
 * The transport factory a provider's options select: the `testing`
 * value's, then `mode`, then the hosted backend at `backendURL`.
 *
 * The provider's module imports this with the hosted transport, which
 * loads with the consent engine: a page that defers the engine does not
 * download it with its first-load JavaScript.
 *
 * @packageDocumentation
 * @internal
 */
import type { HostedModeFactory, ProviderTransportFactory } from '@c15t/core';
import type { ConsentTesting } from '@c15t/core/testing';
import { createHostedTransport } from '@c15t/core/transports';
import { createHostedModeFactory } from '@c15t/core/transports/hosted-factory';

/** One factory per backend URL, so each render hands the provider the same. */
const hostedByURL = new Map<string, HostedModeFactory>();

/**
 * The hosted factory for a backend URL.
 *
 * @param backendURL - Backend URL, relative or absolute.
 * @returns The same factory for the same URL.
 * @internal
 */
export const hostedFor = function hostedFor(
	backendURL: string
): HostedModeFactory {
	let mode = hostedByURL.get(backendURL);
	if (!mode) {
		mode = createHostedModeFactory({ backendURL }, createHostedTransport);
		hostedByURL.set(backendURL, mode);
	}
	return mode;
};

/** The options that pick a provider's transport. */
export interface ModeOptions {
	backendURL?: string;
	mode?: ProviderTransportFactory;
	testing?: ConsentTesting;
}

/**
 * The transport factory the options select.
 *
 * @param options - The provider's options.
 * @returns The factory, or `undefined` when the options set none.
 * @internal
 */
export const selectedMode = function selectedMode(
	options: ModeOptions
): ProviderTransportFactory | undefined {
	if (options.testing) {
		return options.testing.transport;
	}
	if (options.mode) {
		return options.mode;
	}
	return options.backendURL === undefined
		? undefined
		: hostedFor(options.backendURL);
};
