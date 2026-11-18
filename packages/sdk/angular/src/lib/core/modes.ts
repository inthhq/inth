/**
 * The transports `provideC15t()` selects: the hosted backend for
 * `projectUrl`, and `manifest()` for `mode`.
 *
 * Core's factories carry their transport's code: the hosted transport,
 * the manifest resolver. That code would ship with every page's first load
 * through `app.config.ts`. These build the same factories (same `kind`,
 * same options as data, which core and `provideC15tServer()` read) but
 * build their transport with code the consent engine's chunk hands over
 * (`provideModeTransports`) when it loads, before it builds a runtime. A
 * runtime built before then gets a transport that loads the code on first
 * use.
 *
 * @packageDocumentation
 */

import type {
	HostedModeFactory,
	KernelTransport,
	ProviderTransportContext,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import type { HostedMode } from '@inth/sdk/modes';
import type { ConsentTesting } from '@inth/sdk/testing';
import type { HostedTransportOptions } from '@inth/sdk/transports';
import { createHostedModeFactory } from '@inth/sdk/transports/hosted-factory';
import type {
	BrowserManifestModeFactory,
	BrowserManifestOptions,
} from '@inth/sdk/transports/manifest-browser';

/** Builds a hosted transport. @internal */
export type BuildHostedTransport = (
	options: HostedTransportOptions
) => KernelTransport;

/** The transport code the engine's chunk hands over. @internal */
export interface ModeTransports {
	hosted: BuildHostedTransport;
}

let provided: ModeTransports | undefined;

/**
 * Hands the mode factories their transport code. The engine's chunk calls
 * it before it builds a runtime.
 *
 * @param transports - `createHostedTransport` from `@inth/sdk/transports`.
 * @internal
 */
export const provideModeTransports = function provideModeTransports(
	transports: ModeTransports
): void {
	provided = transports;
};

/** A transport whose code loads on first use. */
const lazyTransport = function lazyTransport(
	load: () => Promise<KernelTransport>
): KernelTransport {
	let loading: Promise<KernelTransport> | undefined;
	const current = async (): Promise<KernelTransport> => {
		loading ??= load();
		try {
			return await loading;
		} catch (error) {
			// The next call retries.
			loading = undefined;
			throw error;
		}
	};
	return {
		identify: async (user, subjectId) =>
			(await current()).identify?.(user, subjectId),
		init: async (context) =>
			(await current()).init?.(context) as ReturnType<
				NonNullable<KernelTransport['init']>
			>,
		loadSubjectRecord: async (subjectId) =>
			(await (await current()).loadSubjectRecord?.(subjectId)) ?? null,
		save: async (payload, context) =>
			(await current()).save?.(payload, context) as ReturnType<
				NonNullable<KernelTransport['save']>
			>,
	};
};

/** One factory per backend URL, so a rebuilt options object finds the same. */
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
		mode = createHostedModeFactory({ projectUrl }, (transport) =>
			provided
				? provided.hosted(transport)
				: lazyTransport(async () =>
						(await import('@inth/sdk/transports')).createHostedTransport(
							transport
						)
					)
		);
		hostedByURL.set(projectUrl, mode);
	}
	return mode;
};

/**
 * The transport factory `provideC15t()`'s options select: `mode` when it
 * is a factory or a `testing()` value, else the hosted backend at
 * `projectUrl`.
 *
 * @param options - The provider's `projectUrl` and `mode`.
 * @returns The factory, or `undefined` when none is set. The runtime then
 * throws, naming the provider.
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
	return options.projectUrl === undefined
		? undefined
		: hostedFor(options.projectUrl);
};

/**
 * Resolve policies from a consent manifest, on the server or in the
 * browser. The resolver loads with the first `/init` it answers.
 *
 * @param options - The manifest's URL or snapshot, and where to resolve.
 * @returns A transport factory for `provideC15t()`'s `mode`, carrying its
 * options.
 */
export const manifest = function manifest(
	options: BrowserManifestOptions
): BrowserManifestModeFactory {
	const settings = { ...options } as BrowserManifestOptions;
	// One core factory per `manifest()` call, which keeps one manifest cache.
	let core: Promise<ProviderTransportFactory> | undefined;
	return Object.assign(
		(context?: ProviderTransportContext): KernelTransport =>
			lazyTransport(async () => {
				core ??= (async () =>
					(await import('@inth/sdk/transports/manifest-browser')).manifest(
						settings
					))();
				try {
					return (await core)(context as ProviderTransportContext);
				} catch (error) {
					// A failed chunk request is not cached: the next call retries.
					core = undefined;
					throw error;
				}
			}),
		settings,
		{ kind: 'manifest' as const, type: 'manifest' as const }
	) as BrowserManifestModeFactory;
};
