import { SAFE_NONCE } from '@inth/sdk/server';
/**
 * Keeps a tap on the server-rendered banner made before the app hydrates.
 *
 * A server-rendered banner paints long before Angular attaches its
 * handlers; on a slow phone a tap in that gap lands on a plain `<button>`.
 * The script from `@inth/sdk/surface-actions` records the tap and hides
 * the banner, and `<inth-consent-banner>` records the choice once it
 * hydrates.
 *
 * Angular drops `<script>` from templates and hydration would trip over an
 * extra node in the banner's markup, so the script goes into `<head>`: it
 * listens on the document, so it holds taps wherever the banner renders.
 */
import {
	EARLY_CONSENT_TAP_SCRIPT,
	EARLY_TAP_ROOT,
} from '@inth/sdk/surface-actions';

/** Marks the script, so a page gets it once. @internal */
export const EARLY_TAP_SCRIPT_ATTRIBUTE = 'data-inth-early-tap';

/**
 * Adds the early-tap script to `<head>` when the render has a stock banner.
 *
 * @param document - The document the server rendered.
 * @param nonce - CSP nonce for the script. The script copies it to the
 * `<style>` that hides the banner.
 * @internal
 */
export const addEarlyTapScript = function addEarlyTapScript(
	document: Document,
	nonce: string | null | undefined
): void {
	if (
		!document.querySelector(EARLY_TAP_ROOT) ||
		document.querySelector(`script[${EARLY_TAP_SCRIPT_ATTRIBUTE}]`)
	) {
		return;
	}
	const script = document.createElement('script');
	script.setAttribute(EARLY_TAP_SCRIPT_ATTRIBUTE, '');
	if (nonce && SAFE_NONCE.test(nonce)) {
		script.setAttribute('nonce', nonce);
	}
	script.textContent = EARLY_CONSENT_TAP_SCRIPT;
	const parent = document.head ?? document.documentElement;
	// The server's DOM (domino) has no `prepend()`.
	parent.insertBefore(script, parent.firstChild);
};
