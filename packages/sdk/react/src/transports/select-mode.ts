/**
 * The transport factory a provider's options select: the `testing`
 * value's, then `mode`, then the hosted backend at `backendURL`.
 *
 * A module of its own that imports the hosted transport only as a type,
 * so the deferred provider can pick the mode before the engine loads. The
 * hosted transport comes from the provider's module (`hosted-slot.ts`), or
 * loads on first use for a runtime built before it.
 *
 * @packageDocumentation
 * @internal
 */
import type {
	HostedModeFactory,
	KernelTransport,
	ProviderTransportFactory,
} from '@c15t/core';
import type { ConsentTesting } from '@c15t/core/testing';
import { createHostedModeFactory } from '@c15t/core/transports/hosted-factory';

import { providedHostedTransport } from './hosted-slot';
import type { BuildHostedTransport } from './hosted-slot';

/**
 * A transport that loads the hosted one on first use, for a runtime built
 * before any provider module loaded.
 */
const lazyHostedTransport: BuildHostedTransport = (options) => {
	let loading: Promise<KernelTransport> | undefined;
	const load = (): Promise<KernelTransport> => {
		loading ??= (async () =>
			(await import('@c15t/core/transports')).createHostedTransport(options))();
		return loading;
	};
	return {
		identify: async (user, subjectId) =>
			(await load()).identify?.(user, subjectId),
		init: async (context) =>
			(await load()).init?.(context) as ReturnType<
				NonNullable<KernelTransport['init']>
			>,
		loadSubjectRecord: async (subjectId) =>
			(await (await load()).loadSubjectRecord?.(subjectId)) ?? null,
		save: async (payload, context) =>
			(await load()).save?.(payload, context) as ReturnType<
				NonNullable<KernelTransport['save']>
			>,
	};
};

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
		mode = createHostedModeFactory({ backendURL }, (transport) =>
			(providedHostedTransport() ?? lazyHostedTransport)(transport)
		);
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
