/**
 * `@c15t/react/testing` — render the banner and the consent flow in tests
 * with no backend.
 *
 * Pass `withoutNetwork()` as the provider's `testing` option. It resolves
 * the recommended policy pack in the browser and sends no request; set
 * `overrides.country` (and `overrides.region`) to pick the policy:
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `withoutNetwork({ iab: true })` and `IABProvider` in the
 *   tree: the IAB TCF banner. The provider cannot see `IABProvider`, so
 *   say so here.
 * - `US` with region `CA`: opt-out, with no automatic banner.
 * - `JP`: no banner.
 *
 * It throws in production builds. To keep consent out of the way in an
 * app's own tests instead, set `enabled: false`.
 *
 * @example
 * ```tsx
 * import { ConsentBanner, ConsentProvider } from '@c15t/react';
 * import { withoutNetwork } from '@c15t/react/testing';
 *
 * <ConsentProvider
 *   options={{ overrides: { country: 'DE' }, testing: withoutNetwork() }}
 * >
 *   <ConsentBanner />
 * </ConsentProvider>;
 * ```
 *
 * @packageDocumentation
 */
import { createWithoutNetwork } from '@c15t/core/testing';
import type { ConsentTesting, WithoutNetworkOptions } from '@c15t/core/testing';

export type { ConsentTesting, WithoutNetworkOptions } from '@c15t/core/testing';

/**
 * A `testing` value that resolves the recommended policy pack in the
 * browser and makes no network requests.
 *
 * @param options - `iab: true` resolves the pack's IAB TCF variant.
 * @returns The value for the provider's `testing` option.
 * @throws {Error} When the provider builds its transport in a production
 *   build.
 */
export const withoutNetwork = function withoutNetwork(
	options: WithoutNetworkOptions = {}
): ConsentTesting {
	return createWithoutNetwork('@c15t/react/testing', options);
};
