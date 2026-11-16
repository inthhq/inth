/**
 * The mode factories `provideC15t()` takes: `hosted()`, `local()`,
 * `manifest()` and `custom()`.
 *
 * Core's factories carry their transport's code: `hosted()` the hosted
 * transport, `local()` the policy resolver and its rule pack, `manifest()`
 * the manifest resolver. An app imports one in `app.config.ts`, so that
 * code would ship with every page's first load. These return the same
 * factories (same `kind`, same options as data, which core and
 * `provideC15tServer()` read) but build their transport with code the
 * consent engine's chunk hands over (`provideModeTransports`) when it
 * loads, before it builds a runtime. A runtime built before then, such as
 * one from `createConsentRuntime()`, gets a transport that loads the code
 * on first use. The design of `@c15t/react`'s `hosted()`.
 *
 * @packageDocumentation
 */

import type {
	HostedModeFactory,
	HostedModeOptions,
	KernelTransport,
	OfflineModeFactory,
	OfflineModeOptions,
	ProviderTransportContext,
	ProviderTransportFactory,
} from '@c15t/core';
import type { HostedTransportOptions } from '@c15t/core/transports';
import { createHostedModeFactory } from '@c15t/core/transports/hosted-factory';
import type {
	BrowserManifestModeFactory,
	BrowserManifestOptions,
} from '@c15t/core/transports/manifest-browser';

/** Builds a hosted transport. @internal */
export type BuildHostedTransport = (
	options: HostedTransportOptions
) => KernelTransport;

/** Builds a `local()` factory, as core's `local()`. @internal */
export type BuildLocalMode = (
	options: OfflineModeOptions
) => ProviderTransportFactory;

/** The transport code the engine's chunk hands over. @internal */
export interface ModeTransports {
	hosted: BuildHostedTransport;
	local: BuildLocalMode;
}

let provided: ModeTransports | undefined;

/**
 * Hands the mode factories their transport code. The engine's chunk calls
 * it before it builds a runtime.
 *
 * @param transports - `createHostedTransport` and `local` from
 * `@c15t/core/transports`.
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

/**
 * Ask a c15t backend's `/init` for every visitor's policy.
 *
 * @param options - Backend URL, init headers and request overrides.
 * @returns A transport factory for `provideC15t()`'s `mode`, carrying its
 * options.
 *
 * @example
 * ```ts
 * import { hosted, provideC15t } from '@c15t/angular';
 *
 * provideC15t({ mode: hosted({ backendURL: '/api/c15t' }) });
 * ```
 */
export const hosted = function hosted(
	options: HostedModeOptions
): HostedModeFactory {
	return createHostedModeFactory(options, (transport) =>
		provided
			? provided.hosted(transport)
			: lazyTransport(async () =>
					(await import('@c15t/core/transports')).createHostedTransport(
						transport
					)
				)
	);
};

/**
 * Resolve policy rules in the browser, with no backend. Consent stays in
 * the visitor's browser and nothing records it. For development and tests.
 *
 * @param options - The rules to resolve, and `acknowledgeNoRecords`.
 * Without `policyRules`, core's recommended rule pack.
 * @returns A transport factory for `provideC15t()`'s `mode`, carrying its
 * options.
 *
 * @example
 * ```ts
 * import { local, provideC15t } from '@c15t/angular';
 *
 * provideC15t({ mode: local() });
 * ```
 */
export const local = function local(
	options: OfflineModeOptions = {}
): OfflineModeFactory {
	const settings: OfflineModeOptions = {};
	if (options.policyRules !== undefined) {
		settings.policyRules = options.policyRules;
	}
	if (options.acknowledgeNoRecords !== undefined) {
		settings.acknowledgeNoRecords = options.acknowledgeNoRecords;
	}
	let built: ProviderTransportFactory | undefined;
	return Object.assign(
		(context: ProviderTransportContext): KernelTransport => {
			if (provided) {
				built ??= provided.local(settings);
				return built(context);
			}
			return lazyTransport(async () =>
				(await import('@c15t/core/transports')).local(settings)(context)
			);
		},
		settings,
		{ kind: 'offline' as const, type: 'offline' as const }
	) as OfflineModeFactory;
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
					(await import('@c15t/core/transports/manifest-browser')).manifest(
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

/**
 * Use your own transport.
 *
 * @param transport - A `KernelTransport` with `init` and `save`.
 * @returns A transport factory for `provideC15t()`'s `mode`.
 * @throws {TypeError} When given endpoint handlers instead of a transport.
 */
export const custom = function custom(
	transport: KernelTransport
): ProviderTransportFactory {
	if ('setConsent' in transport) {
		throw new TypeError(
			'c15t: custom() requires a KernelTransport with save(), not endpoint handlers'
		);
	}
	return Object.assign(() => transport, { kind: 'custom' as const });
};
