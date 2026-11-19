/**
 * `@inth/sdk/testing` — run the consent flow in tests with no backend.
 *
 * Pass `testing()` as the `mode` of `init()` from `@inth/sdk`,
 * `@inth/sdk/headless` or `@inth/sdk/iab-client`. It needs no
 * `projectUrl`. It resolves the recommended policy pack in the browser and
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
 * `inth.testing.js` instead of `inth.js`.
 *
 * @example
 * ```ts
 * import { init } from '@inth/sdk';
 * import { testing } from '@inth/sdk/testing';
 *
 * init({ overrides: { country: 'DE' }, mode: testing() });
 * ```
 *
 * @packageDocumentation
 */
import { createTestingMode } from '@inth/sdk-core/testing';
import type {
	ConsentTesting,
	TestingModeOptions,
} from '@inth/sdk-core/testing';

export type {
	ConsentTesting,
	TestingModeOptions,
} from '@inth/sdk-core/testing';

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
	return createTestingMode('@inth/sdk/testing', options);
};
