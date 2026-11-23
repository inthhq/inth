/**
 * Page-level state the first-load shell and the consent engine share: the
 * `window` slots and the banner selectors. Small, for the first-load chunk.
 *
 * @internal
 */

import type { KernelConfig } from '@inth/sdk/engine';

import type { AstroConsentClient } from '../astro-consent-client.model';

/** Where the page's consent client lives. */
export const GLOBAL_KEY = '__inthAstro';
/** Where a page's own `buildConfigScript()` puts the boot payload. */
export const CONFIG_KEY = '__inthAstroConfig';
/** The colour-scheme listener's disposer. */
export const COLOR_SCHEME_KEY = '__inthAstroColorScheme';
/** Set once the delegated banner listener is installed. */
export const ACTIONS_KEY = '__inthAstroActions';

/** `window` with Inth's slots. */
export type ClientWindow = Window &
	typeof globalThis & {
		[GLOBAL_KEY]?: AstroConsentClient;
		[CONFIG_KEY]?: KernelConfig;
		[COLOR_SCHEME_KEY]?: () => void;
		[ACTIONS_KEY]?: boolean;
	};

/** The server-rendered banner roots, standard and IAB. */
export const BANNER_ROOT_SELECTOR =
	'[data-testid="consent-banner-root"], [data-testid="iab-consent-banner-root"]';

/** The overlays a blocking banner renders. */
export const BANNER_OVERLAY_SELECTOR =
	'[data-testid="consent-banner-overlay"], [data-testid="iab-consent-banner-overlay"]';
