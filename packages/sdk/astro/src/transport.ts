/**
 * How a page turns the serialized mode into the transport its runtime
 * uses.
 *
 * The integration knows the mode and whether the site has an adapter when
 * it writes the boot script, so the boot script imports exactly one of
 * these from `@c15t/astro/client` and registers it with
 * `registerTransport()`. Each page ships only the code its mode runs.
 *
 * @internal
 */

import type {
	KernelTransport,
	ProviderTransportContext,
	ProviderTransportFactory,
} from '@c15t/core';
import { createHostedTransport } from '@c15t/core';
import { testingOptionsOf } from '@c15t/core/modes';
import { clientMode } from '@c15t/core/runtime/client-mode';

import type { C15tResolvedOptions } from './types';

/** The options a transport is built from. */
type TransportOptions = Pick<
	C15tResolvedOptions,
	'backendURL' | 'mode' | 'routePrefix'
>;

/**
 * Turns the resolved options into the transport factory the page's runtime
 * uses.
 *
 * @internal
 */
export type ResolveTransport = (
	options: TransportOptions
) => ProviderTransportFactory;

/**
 * `testing()`: resolve the test's policy, or the recommended pack, in the
 * browser with no network.
 *
 * The transport and the policy pack load on the first init, so a page the
 * server already resolved never loads them. The loaded transport throws in
 * production builds. Saves go nowhere: there is no server to acknowledge
 * them.
 *
 * @param options - The resolved integration options, in testing mode.
 * @returns A transport factory for `createConsentKernel`.
 * @internal
 */
export const testingTransport: ResolveTransport = ({ mode }) =>
	Object.assign(
		(context: ProviderTransportContext): KernelTransport => {
			let loading: Promise<KernelTransport> | undefined;
			const load = function load(): Promise<KernelTransport> {
				loading ??= (async () => {
					try {
						const { createTestingMode } = await import('./testing-transport');
						return createTestingMode(
							'@c15t/astro/testing',
							mode.type === 'testing' ? testingOptionsOf(mode) : {}
						).transport(context);
					} catch (error) {
						// Let the kernel's retry make a fresh import attempt.
						loading = undefined;
						throw error;
					}
				})();
				return loading;
			};
			return {
				async init(ctx) {
					const transport = await load();
					return (await transport.init?.(ctx)) ?? {};
				},
				save: (payload) =>
					Promise.resolve({ ok: true, subjectId: payload.subjectId }),
			};
		},
		{ kind: 'offline' as const }
	);

/**
 * `manifest()`, and `hosted()` on a site that renders on demand.
 *
 * The server resolved the visitor, so the page ships only the record
 * transport that saves consent; the init path loads when the page inits
 * again, with the `/init` request sent alongside it. `manifest()` re-inits
 * through `${routePrefix}/init`, and `manifest({ resolve: 'browser' })`
 * loads the browser resolver with `import()`.
 *
 * @param options - The resolved integration options.
 * @returns A transport factory for `createConsentKernel`.
 * @throws {Error} When the mode needs a backend URL and none is set.
 * @internal
 */
export const lazyTransport: ResolveTransport = (options) =>
	clientMode(options.mode, {
		backendURL: options.backendURL,
		routePrefix: options.routePrefix,
	});

/**
 * `hosted()` on a site with no adapter.
 *
 * Every page is prerendered, so every first visit inits in the browser.
 * Splitting the init path into a chunk of its own would only add a
 * request, so the hosted transport ships whole with the page.
 *
 * @param options - The resolved integration options, in hosted mode.
 * @returns A transport factory for `createConsentKernel`.
 * @internal
 */
export const hostedTransport: ResolveTransport = ({ backendURL }) => {
	const options = { backendURL: backendURL ?? '' };
	return Object.assign(() => createHostedTransport(options), {
		kind: 'hosted' as const,
	});
};
