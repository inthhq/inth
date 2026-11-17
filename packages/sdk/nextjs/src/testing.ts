/**
 * `@c15t/nextjs/testing` — run the consent flow in tests with no backend.
 *
 * Set `testing: withoutNetwork()` in `c15t.config.ts`, or pass it as
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
 * // c15t.config.ts, in a test build
 * import { defineConsentConfig } from 'c15t/next';
 * import { withoutNetwork } from 'c15t/next/testing';
 *
 * export default defineConsentConfig({ testing: withoutNetwork() });
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
 * @returns The value for the config's `testing` option.
 */
export const withoutNetwork = function withoutNetwork(
	options: WithoutNetworkOptions = {}
): WithoutNetworkTestingData {
	return { ...options, type: 'without-network' };
};
