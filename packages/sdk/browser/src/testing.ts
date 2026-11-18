/**
 * `@c15t/browser/testing` — run the consent flow in tests with no backend.
 *
 * Pass `testing()` as the `mode` of `init()` from `@c15t/browser`,
 * `@c15t/browser/headless` or `@c15t/browser/iab`. It needs no
 * `backendURL`. It resolves the recommended policy pack in the browser and
 * sends nothing; set `overrides.country` (and `overrides.region`) to pick
 * the policy:
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `iab` configured: the IAB TCF banner.
 * - `US` with region `CA`: opt-out, with no automatic banner.
 * - `JP`: no banner.
 *
 * `testing({ policy })` resolves your own `PolicyRule`s instead, such as
 * a rule with a `notice` prompt for the opt-out notice banner.
 *
 * It throws in production builds. A page with no bundler loads
 * `c15t.testing.js` instead of `c15t.js`.
 *
 * @example
 * ```ts
 * import { init } from '@c15t/browser';
 * import { testing } from '@c15t/browser/testing';
 *
 * init({ overrides: { country: 'DE' }, mode: testing() });
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
 * @param options - `policy` replaces the recommended pack; `iab: true`
 *   picks its IAB TCF variant.
 * @returns The value for `init()`'s `mode`.
 * @throws {Error} When the transport is built in a production build.
 */
export const testing = function testing(
	options: TestingModeOptions = {}
): ConsentTesting {
	return createTestingMode('@c15t/browser/testing', options);
};
