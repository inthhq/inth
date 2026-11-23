/**
 * The page's CSP nonce, read from the config data block, for the first-load
 * shell and the consent engine. Small, for the first-load chunk.
 *
 * @internal
 */

import { CONFIG_KEY } from './page-state.model';

/**
 * The scripts that carry the boot payload: the config data block, or a
 * page's own `buildConfigScript()` script, which has no marker.
 *
 * @returns The config scripts, in document order.
 */
export const configScripts = function configScripts(
	root: Document
): HTMLScriptElement[] {
	return Array.from(root.scripts).filter(
		(element) =>
			element.hasAttribute('data-inth-config') ||
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
 * `Astro.locals.inth.nonce`, or on a page's own `buildConfigScript()`
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
	// no `data-inth-config` element; its own script carries the nonce.
	const scripts = configScripts(root);
	const script =
		scripts.find((element) => element.hasAttribute('data-inth-config')) ??
		scripts[0];
	return script ? nonceOf(script) : undefined;
};
