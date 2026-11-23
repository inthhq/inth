/**
 * The transport factory a provider's options select: `mode` when it is a
 * factory or a `testing()` value, else the hosted backend at `projectUrl`.
 *
 * The provider's module imports this with the hosted transport, which
 * loads with the consent engine: a page that defers the engine does not
 * download it with its first-load JavaScript.
 *
 * @packageDocumentation
 * @internal
 */
import type {
	HostedMode,
	HostedModeFactory,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import type { ConsentTesting } from '@inth/sdk/testing';
import { createV1HostedTransport } from '@inth/sdk/transports';
import { createHostedModeFactory } from '@inth/sdk/transports/hosted-factory';

/** One factory per backend URL, so each render hands the provider the same. */
const hostedByURL = new Map<string, HostedModeFactory>();

/**
 * The hosted factory for a backend URL.
 *
 * @param projectUrl - Backend URL, relative or absolute.
 * @returns The same factory for the same URL.
 * @internal
 */
export const hostedFor = function hostedFor(
	projectUrl: string
): HostedModeFactory {
	let mode = hostedByURL.get(projectUrl);
	if (!mode) {
		mode = createHostedModeFactory({ projectUrl }, createV1HostedTransport);
		hostedByURL.set(projectUrl, mode);
	}
	return mode;
};

/** The options that pick a provider's transport. */
export interface ModeOptions {
	projectUrl?: string;
	mode?: ProviderTransportFactory | HostedMode | ConsentTesting;
}

/**
 * The transport factory the options select.
 *
 * @returns The factory, or `undefined` when the options set none.
 * @internal
 */
export const selectedMode = function selectedMode(
	options: ModeOptions
): ProviderTransportFactory | undefined {
	const { mode } = options;
	if (typeof mode === 'function') {
		return mode;
	}
	// A `testing()` value carries its transport, not enumerable. One that
	// crossed a serialization boundary is data only; the browser side
	// builds its transport.
	if (mode && 'transport' in mode && mode.transport) {
		return mode.transport;
	}
	return options.projectUrl === undefined
		? undefined
		: hostedFor(options.projectUrl);
};
