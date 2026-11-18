import type { TestingModeOptions } from './modes';
/**
 * `@c15t/core/testing` — run the consent flow in tests with no backend.
 *
 * Pass `testing()` as the runtime's `mode`. It needs no `backendURL`. It
 * resolves the recommended policy pack locally, so a test picks the
 * policy by setting `overrides.country` (and `overrides.region`):
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `iab` configured, or with `testing({ iab: true })`:
 *   the IAB TCF banner.
 * - `US` with region `CA`, or another US privacy state: opt-out, with no
 *   automatic banner. The dialog still opens from a link.
 * - `JP`, or another country with no privacy rule: no banner.
 *
 * To test another policy, such as the opt-out notice banner that no
 * recommended rule shows, pass your own rules as `policy`:
 * `testing({ policy: [noticeRule] })`. They use the same
 * `PolicyRule` shape as the backend's policies.
 *
 * It throws when `process.env.NODE_ENV` is `'production'`. Production
 * apps set `backendURL`. To keep consent out of the way in an app's own
 * tests instead, set `enabled: false`: it grants every category, shows no
 * UI and sends nothing.
 *
 * @example
 * ```ts
 * import { createConsentRuntime } from '@c15t/core/runtime';
 * import { testing } from '@c15t/core/testing';
 *
 * const runtime = createConsentRuntime({
 *   overrides: { country: 'DE' },
 *   mode: testing(),
 * });
 * ```
 *
 * @packageDocumentation
 */
import { createTestingMode } from './transports/testing';
import type { ConsentTesting } from './transports/testing';

export type { TestingModeOptions } from './modes';
export type { ConsentTesting } from './transports/testing';
/**
 * Builds the `testing()` an adapter's testing entry exports, with
 * that entry's name in the production error.
 *
 * @internal
 */
export { assertNotProduction, createTestingMode } from './transports/testing';

/**
 * A `mode` for tests: it resolves `policy`, or the recommended policy
 * pack, in the browser and makes no network requests.
 *
 * @param options - `policy` resolves your own rules instead of the
 *   recommended pack; `iab: true` resolves the pack's IAB TCF variant.
 * @returns The value for the runtime's `mode`.
 * @throws {Error} When the transport is built in a production build.
 */
export const testing = function testing(
	options: TestingModeOptions = {}
): ConsentTesting {
	return createTestingMode('@c15t/core/testing', options);
};
