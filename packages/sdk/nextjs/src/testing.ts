/**
 * `@c15t/nextjs/testing` — run the consent flow in tests with no backend.
 *
 * Set `mode: testing()` in `c15t.config.ts`, or pass it as
 * `ConsentRoot`'s `options.mode`. It needs no `backendURL`. The server
 * resolves nothing, and the browser resolves the recommended policy pack
 * with no network; set `overrides.country` (and `overrides.region`) to
 * pick the policy:
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `testing({ iab: true })` and `IABProvider` in the
 *   tree: the IAB TCF banner.
 * - `US` with region `CA`: opt-out, with no automatic banner.
 * - `JP`: no banner.
 *
 * `testing({ policy })` resolves your own `PolicyRule`s instead, such as
 * a rule with a `notice` prompt for the opt-out notice banner.
 *
 * The browser transport throws in production builds. To keep consent out
 * of the way in an app's own tests instead, set `enabled: false`.
 *
 * @example
 * ```ts
 * // c15t.config.ts, in a test build
 * import { defineConsentConfig } from 'c15t/next';
 * import { testing } from 'c15t/next/testing';
 *
 * export default defineConsentConfig({ mode: testing() });
 * ```
 *
 * @packageDocumentation
 */
import type { TestingMode, TestingModeOptions } from '@c15t/core/modes';

export type { TestingMode, TestingModeOptions } from '@c15t/core/modes';

/**
 * A `mode` for tests that resolves `policy`, or the recommended policy
 * pack, in the browser and makes no network requests. Plain data, so it
 * crosses from the server to the browser.
 *
 * @param options - `policy` replaces the recommended pack; `iab: true` picks its IAB TCF variant.
 * @returns The value for the config's `mode`.
 */
export const testing = function testing(
	options: TestingModeOptions = {}
): TestingMode {
	return { ...options, type: 'testing' };
};
