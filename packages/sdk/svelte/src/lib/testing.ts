/**
 * `@c15t/svelte/testing` — render the banner and the consent flow in tests
 * with no backend.
 *
 * Pass `testing()` as `<ConsentProvider mode>`, or as
 * `c15tHandle({ mode })` in SvelteKit. It needs no `projectUrl`. It
 * resolves the recommended policy pack in the browser and sends nothing;
 * set `overrides.country` (and `overrides.region`) to pick the policy:
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
 * ```svelte
 * <script lang="ts">
 *   import { ConsentBanner, ConsentProvider } from '@c15t/svelte';
 *   import { testing } from '@c15t/svelte/testing';
 * </script>
 *
 * <ConsentProvider overrides={{ country: 'DE' }} mode={testing()}>
 *   <ConsentBanner />
 * </ConsentProvider>
 * ```
 *
 * @packageDocumentation
 */
import { createTestingMode } from '@c15t/core/testing';
import type { ConsentTesting, TestingModeOptions } from '@c15t/core/testing';

export type { ConsentTesting, TestingModeOptions } from '@c15t/core/testing';

/**
 * A `mode` for tests that resolves `policy`, or the recommended policy
 * pack, in the browser and makes no network requests. It serializes as plain data, so
 * `c15tHandle()` can carry it to the browser.
 *
 * @param options - `policy` replaces the recommended pack; `iab: true` picks its IAB TCF variant.
 * @returns The value for `mode`.
 * @throws {Error} When the transport is built in a production build.
 */
export const testing = function testing(
	options: TestingModeOptions = {}
): ConsentTesting {
	return createTestingMode('@c15t/svelte/testing', options);
};
