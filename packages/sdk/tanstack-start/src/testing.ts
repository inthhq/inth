/**
 * `@c15t/tanstack-start/testing` — run the consent flow in tests with no backend.
 *
 * Pass `testing: withoutNetwork()` to `resolveConsent()`, or
 * `ConsentRoot`'s `options.testing`. The server resolves nothing, and the
 * browser resolves the recommended policy pack with no network; set
 * `overrides.country` (and `overrides.region`) to pick the policy:
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `withoutNetwork({ iab: true })` and `IABProvider` in the
 *   tree: the IAB TCF banner.
 * - `US` with region `CA`: opt-out, with no automatic banner.
 * - `JP`: no banner.
 *
 * The browser transport throws in production builds. To keep consent out
 * of the way in an app's own tests instead, set `enabled: false`.
 *
 * @example
 * ```ts
 * import { resolveConsent } from '@c15t/tanstack-start/server';
 * import { withoutNetwork } from '@c15t/tanstack-start/testing';
 *
 * const state = await resolveConsent(request, { testing: withoutNetwork() });
 * ```
 *
 * @packageDocumentation
 */
import type {
	WithoutNetworkOptions,
	WithoutNetworkTestingData,
} from '@c15t/core/modes';

export type {
	WithoutNetworkOptions,
	WithoutNetworkTestingData,
} from '@c15t/core/modes';

/**
 * A `testing` value that resolves the recommended policy pack in the
 * browser and makes no network requests. Plain data, so it crosses from
 * the server to the browser.
 *
 * @param options - `iab: true` resolves the pack's IAB TCF variant.
 * @returns The value for `resolveConsent()`'s `testing` option.
 */
export const withoutNetwork = function withoutNetwork(
	options: WithoutNetworkOptions = {}
): WithoutNetworkTestingData {
	return { ...options, type: 'without-network' };
};
