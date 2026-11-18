/**
 * Page-level state the first-load shell and the consent engine share: the
 * `window` slots and the page's CSP nonce. Small, for the first-load chunk.
 *
 * @internal
 */

import type { KernelConfig } from '@inth/sdk/engine';

import type { AstroConsentClient } from '../client-types';

/** Where the page's consent client lives. */
export const GLOBAL_KEY = '__c15tAstro';
/** Where a page's own `buildConfigScript()` puts the boot payload. */
export const CONFIG_KEY = '__c15tAstroConfig';
/** The colour-scheme listener's disposer. */
export const COLOR_SCHEME_KEY = '__c15tAstroColorScheme';
/** Set once the delegated banner listener is installed. */
export const ACTIONS_KEY = '__c15tAstroActions';

/** `window` with c15t's slots. */
export type ClientWindow = Window &
	typeof globalThis & {
		[GLOBAL_KEY]?: AstroConsentClient;
		[CONFIG_KEY]?: KernelConfig;
		[COLOR_SCHEME_KEY]?: () => void;
		[ACTIONS_KEY]?: boolean;
	};

/** `window`, or `undefined` outside the browser. */
export const getWindow = function getWindow(): ClientWindow | undefined {
	return typeof window === 'undefined' ? undefined : (window as ClientWindow);
};

/**
 * The scripts that carry the boot payload: the config data block, or a
 * page's own `buildConfigScript()` script, which has no marker.
 *
 * @param root - The document to read.
 * @returns The config scripts, in document order.
 */
export const configScripts = function configScripts(
	root: Document
): HTMLScriptElement[] {
	return Array.from(root.scripts).filter(
		(element) =>
			element.hasAttribute('data-c15t-config') ||
			element.textContent?.startsWith(`window.${CONFIG_KEY}=`)
	);
};

/** An element's nonce, read the way {@link readPageNonce} explains. */
export const nonceOf = function nonceOf(
	element: HTMLElement
): string | undefined {
	return element.nonce || element.getAttribute('nonce') || undefined;
};

/**
 * The nonce the server put on the config data block, from
 * `Astro.locals.c15t.nonce`, or on a page's own `buildConfigScript()`
 * script.
 *
 * Read through the `nonce` property first: browsers hide the attribute's
 * value once a policy has checked it, but keep it on the property.
 *
 * @param root - The document to read. Defaults to the live page.
 * @returns The nonce, or `undefined` when the page was rendered without one.
 */
export const readPageNonce = function readPageNonce(
	root: Document = document
): string | undefined {
	// A page that still assigns the payload with `buildConfigScript()` has
	// no `data-c15t-config` element; its own script carries the nonce.
	const scripts = configScripts(root);
	const script =
		scripts.find((element) => element.hasAttribute('data-c15t-config')) ??
		scripts[0];
	return script ? nonceOf(script) : undefined;
};

/** The server-rendered banner roots, standard and IAB. */
export const BANNER_ROOT_SELECTOR =
	'[data-testid="consent-banner-root"], [data-testid="iab-consent-banner-root"]';

/** The overlays a blocking banner renders. */
export const BANNER_OVERLAY_SELECTOR =
	'[data-testid="consent-banner-overlay"], [data-testid="iab-consent-banner-overlay"]';
