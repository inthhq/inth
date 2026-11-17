/**
 * `@c15t/svelte/testing` — render the banner and the consent flow in tests
 * with no backend.
 *
 * Pass `withoutNetwork()` as `<ConsentProvider testing>`, or as
 * `c15tHandle({ testing })` in SvelteKit. It resolves the recommended
 * policy pack in the browser and sends nothing; set `overrides.country`
 * (and `overrides.region`) to pick the policy:
 *
 * - `DE`, any other EEA country, `GB`, or no country: the opt-in banner.
 * - `DE` with `iab` configured, or `withoutNetwork({ iab: true })`: the
 *   IAB TCF banner.
 * - `US` with region `CA`: opt-out, with no automatic banner.
 * - `JP`: no banner.
 *
 * It throws in production builds. To keep consent out of the way in an
 * app's own tests instead, set `enabled: false`.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { ConsentBanner, ConsentProvider } from '@c15t/svelte';
 *   import { withoutNetwork } from '@c15t/svelte/testing';
 * </script>
 *
 * <ConsentProvider overrides={{ country: 'DE' }} testing={withoutNetwork()}>
 *   <ConsentBanner />
 * </ConsentProvider>
 * ```
 *
 * @packageDocumentation
 */
import { createWithoutNetwork } from '@c15t/core/testing';
import type { ConsentTesting, WithoutNetworkOptions } from '@c15t/core/testing';

export type { ConsentTesting, WithoutNetworkOptions } from '@c15t/core/testing';

/**
 * A `testing` value that resolves the recommended policy pack in the
 * browser and makes no network requests. It serializes as plain data, so
 * `c15tHandle()` can carry it to the browser.
 *
 * @param options - `iab: true` resolves the pack's IAB TCF variant.
 * @returns The value for the `testing` option.
 * @throws {Error} When the transport is built in a production build.
 */
export const withoutNetwork = function withoutNetwork(
	options: WithoutNetworkOptions = {}
): ConsentTesting {
	return createWithoutNetwork('@c15t/svelte/testing', options);
};
