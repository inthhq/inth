/**
 * `inthHandle()` resolves the consent cookie and the geo/language/GPC
 * headers once per request onto `event.locals.inth`, together with the mode
 * each arm's `loadConsent` resolves with.
 *
 * Two handles, picked by path:
 *
 * - `/ssr` resolves `hosted()`: `loadConsent` asks the fixture backend's
 *   `/init` on the request path, so the consent round-trip lands in the
 *   page's TTFB. This is the arm manifest mode is measured against.
 * - Every other route resolves `manifest()` on the server from the
 *   fixture's manifest, fetched at runtime and cached in-process. The
 *   browser saves through `/api/inth` and re-inits through the app's own
 *   consent route (`createConsentRoute`) under the same prefix.
 */
import { inthHandle, hosted, manifest } from '@inth/svelte/kit';
import type { InthHandle } from '@inth/svelte/kit';

const hostedHandle = inthHandle({
	mode: hosted(),
	projectUrl: '/api/bench-consent',
});

const manifestHandle = inthHandle({
	mode: manifest({
		manifestUrl: '/api/bench-consent/manifest',
		source: 'runtime',
	}),
	projectUrl: '/api/inth',
	routePrefix: '/api/inth',
});

const isHostedArm = function isHostedArm(pathname: string): boolean {
	return pathname === '/ssr' || pathname.startsWith('/ssr/');
};

export const handle: InthHandle = (input) =>
	isHostedArm(input.event.url.pathname)
		? hostedHandle(input)
		: manifestHandle(input);
