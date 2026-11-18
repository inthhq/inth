import type { ProviderTransportFactory } from '@inth/sdk-core';
import { hosted } from '@inth/sdk-core/transports';

import { createConsentClientWith, hostedMode } from './client-base';
import type { CreateConsentClientContext } from './client-base';
import { readHostedMarker } from './init/hosted-marker';
import type {
	ConsentClient,
	HostedConsentClientOptions,
	ScriptTagClientOptions,
} from './types';

/**
 * Create a hosted client with no manifest mode selection.
 *
 * @param options - Hosted options, including a backend URL or hosted factory.
 * @param context - Entry-point wiring.
 * @returns The client, not started.
 * @throws {Error} For another mode, manifest inputs, or no backend.
 * @internal
 */
export const createHostedConsentClient = function createHostedConsentClient(
	options: ScriptTagClientOptions | HostedConsentClientOptions = {},
	context: CreateConsentClientContext = {}
): ConsentClient {
	if (options.manifest !== undefined || options.manifestUrl !== undefined) {
		throw new Error('@inth/sdk/hosted: manifest inputs need manifest mode.');
	}
	// `hosted()` from `@inth/sdk/hosted` is data; read it as the name.
	const { mode: given } = options;
	const mode =
		typeof given === 'object' &&
		given !== null &&
		(given as { type?: unknown }).type === 'hosted'
			? 'hosted'
			: given;
	if (
		mode !== undefined &&
		mode !== 'hosted' &&
		!(typeof mode === 'function' && mode.kind === 'hosted')
	) {
		throw new Error('@inth/sdk/hosted: only hosted mode is supported.');
	}
	// `c15t.hosted()` called on the init script's stand-in.
	const marked = readHostedMarker(mode);
	let factory: ProviderTransportFactory;
	if (marked) {
		factory = hosted(marked);
	} else if (typeof mode === 'function') {
		factory = mode;
	} else {
		({ factory } = hostedMode(options.projectUrl, '@inth/sdk/hosted'));
	}
	return createConsentClientWith(options, { factory, name: 'hosted' }, context);
};
