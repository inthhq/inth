/**
 * Hosted mode for the React provider: core's `hosted()`, with the backend
 * URL the build integration read as the default.
 *
 * The factory is the one core's `hosted()` returns, but the transport is
 * built by whatever the provider's module provided: the provider loads
 * with the consent engine, so a page that defers the engine does not
 * download the hosted transport with its first-load JavaScript.
 */
import type {
	HostedModeFactory,
	HostedModeOptions,
	KernelTransport,
} from '@c15t/core';
import { backendURL as builtBackendURL } from '@c15t/core/generated';
import { createHostedModeFactory } from '@c15t/core/transports/hosted-factory';

import { providedHostedTransport } from './hosted-slot';
import type { BuildHostedTransport } from './hosted-slot';

/**
 * A transport that loads the hosted one on first use, for a runtime built
 * before any provider module loaded (a runtime created outside the
 * provider with this `hosted()`).
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

/**
 * Bundlers replace `process.env.NODE_ENV` at build time, so production
 * bundles drop the setup hint behind it.
 */
declare const process: { env: { NODE_ENV?: string } };

/** Options for {@link hosted}. `backendURL` defaults to the build's. */
export type HostedOptions = Omit<HostedModeOptions, 'backendURL'> & {
	/**
	 * Backend URL, relative (`/api/c15t`) or absolute. Defaults to the URL
	 * `consentManifest()` from `c15t/build` read from
	 * `VITE_C15T_BACKEND_URL` or `VITE_INTH_PROJECT_URL`.
	 */
	backendURL?: string;
};

/**
 * Build a hosted factory, taking the backend URL from the build when the
 * options name none.
 *
 * @param options - The page's options.
 * @param buildBackendURL - The backend URL the build read, if any.
 * @returns A hosted transport factory.
 * @throws {Error} When neither names a backend URL.
 * @internal
 */
export const hostedWithBuild = function hostedWithBuild(
	options: HostedOptions,
	buildBackendURL: string | undefined
): HostedModeFactory {
	const backendURL = options.backendURL ?? buildBackendURL;
	if (backendURL === undefined) {
		throw new Error(
			`c15t: hosted() needs \`backendURL\`.${
				process.env.NODE_ENV === 'production'
					? ''
					: ' Pass it, or add consentManifest() from c15t/build to your Vite config and set VITE_C15T_BACKEND_URL (or VITE_INTH_PROJECT_URL).'
			}`
		);
	}
	return createHostedModeFactory({ ...options, backendURL }, (transport) =>
		(providedHostedTransport() ?? lazyHostedTransport)(transport)
	);
};

/**
 * Ask the backend's `/init` for every visitor's policy.
 *
 * @param options - Backend URL, init headers and request overrides.
 * @returns A transport factory for the provider's `mode`, carrying its
 * options.
 * @throws {Error} When no backend URL is passed and the build set none.
 * @example
 * ```tsx
 * import { ConsentProvider, hosted } from 'c15t/react';
 *
 * <ConsentProvider options={{ mode: hosted() }}>{children}</ConsentProvider>;
 * ```
 */
export const hosted = function hosted(
	options: HostedOptions = {}
): HostedModeFactory {
	return hostedWithBuild(options, builtBackendURL);
};
