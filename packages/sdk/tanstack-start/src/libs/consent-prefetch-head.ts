import type { KernelOverrides } from '@inth/sdk/engine';
import {
	buildPrefetchScript,
	getMatchingPrefetchedInitialData,
	PREFETCH_SCRIPT_ID,
} from '@inth/sdk/engine';

import type { ConsentPrefetchHead, ConsentPrefetchHeadOptions } from '../types';

/**
 * Base URL the head prefetch script keyed its request on: the route prefix
 * when the root sends init through the consent route, or the backend itself
 * when it calls the backend directly. The script requests `${base}/v1/consent/init`.
 * The prefix comes from the state, which `resolveConsent` normalized.
 */
const prefetchBaseFor = function prefetchBaseFor(
	projectUrl: string,
	routePrefix: string | undefined
): string {
	return routePrefix ?? projectUrl;
};

/**
 * Finds the init response a `consentPrefetchHead()` script started for
 * this root's init endpoint, so the provider can consume it instead of
 * issuing a second `/v1/consent/init` request. Client only; `undefined` on the server
 * or when no matching prefetch exists.
 */
export const readPrefetchedInitialData =
	function readPrefetchedInitialData(input: {
		projectUrl: string | undefined;
		overrides: KernelOverrides | undefined;
		routePrefix: string | undefined;
	}): ReturnType<typeof getMatchingPrefetchedInitialData> {
		if (!input.projectUrl || typeof window === 'undefined') {
			return undefined;
		}
		return getMatchingPrefetchedInitialData({
			overrides: input.overrides,
			projectUrl: prefetchBaseFor(input.projectUrl, input.routePrefix),
		});
	};

/**
 * Builds a route `head()` fragment that starts the `/v1/consent/init` prefetch before
 * hydration. This is the TanStack Start equivalent of the Next.js
 * `InthPrefetch` script: the inline script issues the init request as
 * early as the browser parses `<head>`, and the client runtime consumes
 * the matching response during its first store initialization.
 *
 * Use it on prerendered or `ssr: false` routes where no loader runs on the
 * server, so the banner still resolves as early as possible. Point
 * `projectUrl` at the base the root's init request goes to: the
 * `routePrefix` the state carries when it has one, such as `/api/inth`,
 * otherwise the backend URL. `InthProvider` looks the response up by that
 * base and hands it to the provider as its first init.
 *
 * @returns A fragment with a `scripts` array to spread into `head()`.
 * @example
 * ```tsx
 * import { consentPrefetchHead } from '@inth/tanstack-start';
 *
 * export const Route = createRootRoute({
 *   head: () => ({
 *     meta: [{ title: 'My app' }],
 *     ...consentPrefetchHead({ projectUrl: 'https://consent.example.com' }),
 *   }),
 * });
 * ```
 */
export const consentPrefetchHead = function consentPrefetchHead({
	id = PREFETCH_SCRIPT_ID,
	...options
}: ConsentPrefetchHeadOptions): ConsentPrefetchHead {
	return {
		scripts: [{ children: buildPrefetchScript(options), id }],
	};
};
