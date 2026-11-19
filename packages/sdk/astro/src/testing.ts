/**
 * `@inth/astro/testing` — run the consent flow in tests with no backend.
 *
 * Pass `mode: testing()` to the `inth()` integration. It needs no
 * `projectUrl`. The server and the browser resolve the recommended policy
 * pack with no network; set `overrides.country` (and `overrides.region`)
 * to pick the policy:
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `iab` configured, or `testing({ iab: true })`: the IAB TCF
 *   banner.
 * - `US` with region `CA`: opt-out, with no automatic banner.
 * - `JP`: no banner.
 *
 * `testing({ policy })` resolves your own `PolicyRule`s instead, such as
 * a rule with a `notice` prompt for the opt-out notice banner.
 *
 * The server and the browser throw in production builds. To keep consent
 * out of the way in an app's own tests instead, set `enabled: false`.
 *
 * @example
 * ```ts
 * // astro.config.mjs, in a test build
 * import Inth from '@inth/astro';
 * import { testing } from '@inth/astro/testing';
 *
 * export default defineConfig({
 *   integrations: [inth({ mode: testing() })],
 * });
 * ```
 *
 * @packageDocumentation
 */
import type { TestingMode, TestingModeOptions } from '@inth/sdk/modes';

export type { TestingMode, TestingModeOptions } from '@inth/sdk/modes';

/**
 * A `mode` for tests that resolves `policy`, or the recommended policy
 * pack, with no network requests. Plain data, so the integration can
 * serialize it into the page.
 *
 * @param options - `policy` replaces the recommended pack; `iab: true`
 *   picks its IAB TCF variant.
 * @returns The value for the integration's `mode`.
 */
export const testing = function testing(
	options: TestingModeOptions = {}
): TestingMode {
	return { ...options, type: 'testing' };
};
