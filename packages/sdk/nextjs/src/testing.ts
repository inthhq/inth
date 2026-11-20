/**
 * `@inth/nextjs/testing` — run the consent flow in tests with no backend.
 *
 * Set `mode: testing()` in `inth.config.ts`, or pass it as
 * `InthProvider`'s `options.mode`. It needs no `projectUrl`. The server
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
 * // inth.config.ts, in a test build
 * import { defineConsentConfig } from '@inth/nextjs';
 * import { testing } from '@inth/nextjs/testing';
 *
 * export default defineConsentConfig({ mode: testing() });
 * ```
 *
 * @packageDocumentation
 */
import type { TestingMode, TestingModeOptions } from '@inth/sdk/modes';

export type { TestingMode, TestingModeOptions } from '@inth/sdk/modes';

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
