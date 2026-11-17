import { hosted } from '@c15t/core/transports';
import type { ProviderTransportFactory } from '@c15t/core';

import { createConsentClientWith } from './client-base';
import type { CreateConsentClientContext } from './client-base';
import { readHostedMarker } from './init/hosted-marker';
import type {
	ConsentClient,
	HostedConsentClientOptions,
	ScriptTagClientOptions,
} from './types';

const defaultHostedFactory = function defaultHostedFactory(
	backendURL: string | undefined
): ProviderTransportFactory {
	if (!backendURL) {
		throw new Error(
			'@c15t/browser/hosted: `backendURL` is required (data-backend-url on the script tag).'
		);
	}
	return hosted({ backendURL });
};

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
	if (options.manifest !== undefined || options.manifestURL !== undefined) {
		throw new Error(
			'@c15t/browser/hosted: manifest inputs need manifest mode.'
		);
	}
	// `hosted()` from `@c15t/browser/hosted` is data; read it as the name.
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
		throw new Error('@c15t/browser/hosted: only hosted mode is supported.');
	}
	// `c15t.hosted()` called on the init script's stand-in.
	const marked = readHostedMarker(mode);
	let factory: ProviderTransportFactory;
	if (marked) {
		factory = hosted(marked);
	} else if (typeof mode === 'function') {
		factory = mode;
	} else {
		factory = defaultHostedFactory(options.backendURL);
	}
	return createConsentClientWith(options, { factory, name: 'hosted' }, context);
};
