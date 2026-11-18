import { createTestingMode } from '@inth/sdk/testing';
import type { ConsentTesting, TestingModeOptions } from '@inth/sdk/testing';

/**
 * A `mode` for `provideC15t()` in tests. It needs no `projectUrl`. It
 * resolves `policy`, or the recommended policy pack, in the browser, and
 * on the server with `provideC15tServer()`, and makes no network
 * requests. Set `overrides.country` (and `overrides.region`) to pick the
 * policy:
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
 * @param options - `policy` replaces the recommended pack; `iab: true` picks its IAB TCF variant.
 * @returns The value for `provideC15t()`'s `mode`.
 * @throws {Error} When the transport is built in a production build.
 * @example
 * ```ts
 * import { provideC15t } from '@inth/angular';
 * import { testing } from '@inth/angular/testing';
 *
 * TestBed.configureTestingModule({
 *   providers: [
 *     provideC15t({ overrides: { country: 'DE' }, mode: testing() }),
 *   ],
 * });
 * ```
 */
export const testing = function testing(
	options: TestingModeOptions = {}
): ConsentTesting {
	return createTestingMode('@inth/angular/testing', options);
};

export type { ConsentTesting, TestingModeOptions };
