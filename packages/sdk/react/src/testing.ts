/**
 * `@c15t/react/testing` — render the banner and the consent flow in tests
 * with no backend.
 *
 * Pass `testing()` as the provider's `mode`; it needs no `backendURL`. It
 * resolves the recommended policy pack in the browser and sends no
 * request; set `overrides.country` (and `overrides.region`) to pick the
 * policy:
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `testing({ iab: true })` and `IABProvider` in the
 *   tree: the IAB TCF banner. The provider cannot see `IABProvider`, so
 *   say so here.
 * - `US` with region `CA`: opt-out, with no automatic banner.
 * - `JP`: no banner.
 *
 * `testing({ policy })` resolves your own `PolicyRule`s instead, such as
 * a rule with a `notice` prompt for the opt-out notice banner.
 *
 * It throws in production builds. To keep consent out of the way in an
 * app's own tests instead, set `enabled: false`.
 *
 * @example
 * ```tsx
 * import { ConsentBanner, ConsentProvider } from '@c15t/react';
 * import { testing } from '@c15t/react/testing';
 *
 * <ConsentProvider
 *   options={{ overrides: { country: 'DE' }, mode: testing() }}
 * >
 *   <ConsentBanner />
 * </ConsentProvider>;
 * ```
 *
 * @packageDocumentation
 */
import { createTestingMode } from '@c15t/core/testing';
import type { ConsentTesting, TestingModeOptions } from '@c15t/core/testing';

export type { ConsentTesting, TestingModeOptions } from '@c15t/core/testing';

/**
 * A `mode` for tests that resolves `policy`, or the recommended policy
 * pack, in the browser and makes no network requests.
 *
 * @param options - `policy` replaces the recommended pack; `iab: true` picks its IAB TCF variant.
 * @returns The value for the provider's `mode`.
 * @throws {Error} When the provider builds its transport in a production
 *   build.
 */
export const testing = function testing(
	options: TestingModeOptions = {}
): ConsentTesting {
	return createTestingMode('@c15t/react/testing', options);
};
