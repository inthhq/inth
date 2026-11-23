import type { ResolveTransport } from './transport-resolvers.model';

/** Set by the engine module; see {@link registerTransport}. */
let pageTransport: ResolveTransport | null = null;

/**
 * Pick how the page turns the serialized mode into a transport.
 *
 * The engine module registers the variant that fits the site, so the page
 * ships only that one: a site that renders on demand loads the init path
 * when a page inits again, and a site with no adapter, whose every page
 * inits in the browser, ships the hosted transport with the page. Call
 * before `boot()`.
 *
 * @param resolve - Turns the resolved options into a transport factory.
 * @internal
 */
export const registerTransport = function registerTransport(
	resolve: ResolveTransport
): void {
	pageTransport = resolve;
};

/**
 * The transport resolver the engine module registered, or `null`.
 *
 * @internal
 */
export const registeredTransport =
	function registeredTransport(): ResolveTransport | null {
		return pageTransport;
	};
