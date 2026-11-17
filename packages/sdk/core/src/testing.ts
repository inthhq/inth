/**
 * `@c15t/core/testing` — run the consent flow in tests with no backend.
 *
 * Pass `withoutNetwork()` as the runtime's `testing` option. It resolves
 * the recommended policy pack locally, so a test picks the policy by
 * setting `overrides.country` (and `overrides.region`):
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `iab` configured: the IAB TCF banner.
 * - `US` with region `CA`, or another US privacy state: opt-out, with no
 *   automatic banner. The dialog still opens from a link.
 * - `JP`, or another country with no privacy rule: no banner.
 *
 * The pack has no rule that shows the opt-out notice banner. A test that
 * needs one passes its own transport as `mode`, such as one built with
 * `createOfflineTransport({ policyRules })` from `@c15t/core/transports`.
 *
 * It throws when `process.env.NODE_ENV` is `'production'`. Production
 * apps set `backendURL`. To keep consent out of the way in an app's own
 * tests instead, set `enabled: false`: it grants every category, shows no
 * UI and sends nothing.
 *
 * @example
 * ```ts
 * import { createConsentRuntime } from '@c15t/core';
 * import { withoutNetwork } from '@c15t/core/testing';
 *
 * const runtime = createConsentRuntime({
 *   overrides: { country: 'DE' },
 *   testing: withoutNetwork(),
 * });
 * ```
 *
 * @packageDocumentation
 */
import { createWithoutNetwork } from './transports/without-network';
import type { ConsentTesting } from './transports/without-network';

export type { ConsentTesting } from './transports/without-network';

/**
 * A `testing` value that resolves the recommended policy pack in the
 * browser and makes no network requests.
 *
 * @returns The value for the runtime's `testing` option.
 * @throws {Error} When the transport is built in a production build.
 */
export const withoutNetwork = function withoutNetwork(): ConsentTesting {
	return createWithoutNetwork('@c15t/core/testing');
};
