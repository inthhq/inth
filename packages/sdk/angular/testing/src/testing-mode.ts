import { createWithoutNetwork } from '@c15t/core/testing';
import type { ConsentTesting, WithoutNetworkOptions } from '@c15t/core/testing';

/**
 * A `testing` value for `provideC15t()` that resolves the recommended
 * policy pack in the browser, and on the server with
 * `provideC15tServer()`, and makes no network requests. Set
 * `overrides.country` (and `overrides.region`) to pick the policy:
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `iab` configured, or `withoutNetwork({ iab: true })`: the
 *   IAB TCF banner.
 * - `US` with region `CA`: opt-out, with no automatic banner.
 * - `JP`: no banner.
 *
 * It throws in production builds. To keep consent out of the way in an
 * app's own tests instead, set `enabled: false`.
 *
 * @param options - `iab: true` resolves the pack's IAB TCF variant.
 * @returns The value for `provideC15t()`'s `testing` option.
 * @throws {Error} When the transport is built in a production build.
 * @example
 * ```ts
 * import { provideC15t } from '@c15t/angular';
 * import { withoutNetwork } from '@c15t/angular/testing';
 *
 * TestBed.configureTestingModule({
 *   providers: [
 *     provideC15t({ overrides: { country: 'DE' }, testing: withoutNetwork() }),
 *   ],
 * });
 * ```
 */
export const withoutNetwork = function withoutNetwork(
	options: WithoutNetworkOptions = {}
): ConsentTesting {
	return createWithoutNetwork('@c15t/angular/testing', options);
};

export type { ConsentTesting, WithoutNetworkOptions };
