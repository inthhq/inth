/**
 * `@inth/vue/testing` — render the banner and the consent flow in tests
 * with no backend.
 *
 * Pass `testing()` as the plugin's `mode`, or as `inth.mode` in
 * `nuxt.config.ts`. It needs no `projectUrl`. It resolves the recommended
 * policy pack in the browser and sends nothing; set `overrides.country`
 * (and `overrides.region`) to pick the policy:
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `iab` configured, or `testing({ iab: true })`: the
 *   IAB TCF banner.
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
 * ```ts
 * import { inth } from '@inth/vue/vue-plugin';
 * import { testing } from '@inth/vue/testing';
 *
 * app.use(inth, {
 *   overrides: { country: 'DE' },
 *   mode: testing(),
 * });
 * ```
 *
 * @packageDocumentation
 */
import { createTestingMode } from '@inth/sdk/testing';
import type { ConsentTesting, TestingModeOptions } from '@inth/sdk/testing';

export type { ConsentTesting, TestingModeOptions } from '@inth/sdk/testing';

/**
 * A `mode` for tests that resolves `policy`, or the recommended policy
 * pack, in the browser and makes no network requests. It serializes as plain data, so
 * `nuxt.config.ts` can carry it to the browser.
 *
 * @param options - `policy` replaces the recommended pack; `iab: true` picks its IAB TCF variant.
 * @returns The value for `mode`.
 * @throws {Error} When the transport is built in a production build.
 */
export const testing = function testing(
	options: TestingModeOptions = {}
): ConsentTesting {
	return createTestingMode('@inth/vue/testing', options);
};
