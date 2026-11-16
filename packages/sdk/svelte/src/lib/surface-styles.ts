/**
 * The stylesheets the stock Svelte surfaces render themselves.
 *
 * An app that imports no c15t stylesheet still gets styled surfaces. In
 * the browser, each surface inserts the sheets it uses into `<head>` as it
 * renders, once per page, before its own elements. On a server-rendered
 * SvelteKit page, the banner names its sheets in a `<meta>` marker and
 * `c15tHandle` writes them into the HTML, so no stylesheet `<link>` holds
 * back the first paint and the banner is styled before hydration.
 *
 * Each surface names only the sheets it renders: the banner the tokens,
 * button and banner rules, the trigger the tokens and its own, the
 * ConsentGate the tokens, button and its own. They are the deferred form:
 * an id and a `load()`, without the text. On a server-rendered page the
 * surfaces find the copy `c15tHandle` wrote and download nothing; a page
 * rendered only in the browser loads each text once.
 */
import * as banner from '@c15t/ui/styles/sheets/banner-deferred';
import * as button from '@c15t/ui/styles/sheets/button-deferred';
import * as consentGate from '@c15t/ui/styles/sheets/consent-gate-deferred';
import * as tokens from '@c15t/ui/styles/sheets/tokens-deferred';
import * as trigger from '@c15t/ui/styles/sheets/trigger-deferred';

/** A stylesheet from `@c15t/ui/styles/sheets/*`. */
export interface SurfaceStyleSheet {
	/** Dedupes the stylesheet: a page holds each `id` once. */
	readonly id: string;
	/** The stylesheet text. Empty for a deferred sheet. */
	readonly css: string;
	/**
	 * Loads the text of a deferred sheet: one the server render normally
	 * puts in the HTML, so the browser bundle does not carry it again.
	 */
	readonly load?: () => Promise<string>;
}

/**
 * What the banner renders: the theme tokens, the button rules, and the
 * banner, branding, action and legal-link rules with the variables they
 * read. A server-rendered banner puts only these in the HTML.
 */
export const BANNER_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	banner,
];

/** What the dialog trigger renders. */
export const TRIGGER_SHEETS: readonly SurfaceStyleSheet[] = [tokens, trigger];

/** What the ConsentGate placeholder renders, with its button. */
export const CONSENT_GATE_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	consentGate,
];

/** Marks the `<style>` elements that hold a sheet; the value is its `id`. */
export const STYLE_ATTRIBUTE = 'data-c15t-styles';

/** Name of the `<meta>` marker a server-rendered surface leaves in `<head>`. */
export const STYLES_MARKER = 'c15t-styles';

/**
 * The marker's `content`: the sheet ids, space-separated, then an optional
 * `nonce=…` for the `<style>` elements `c15tHandle` writes.
 *
 * @param sheets - The surface's sheets.
 * @param nonce - The provider's `nonce` option.
 * @returns The marker content.
 * @internal
 */
export const stylesMarker = function stylesMarker(
	sheets: readonly SurfaceStyleSheet[],
	nonce: string | undefined
): string {
	const ids = sheets.map((sheet) => sheet.id).join(' ');
	return nonce ? `${ids} nonce=${nonce}` : ids;
};

/**
 * Rules a deferred sheet's element holds until its text arrives: the stock
 * surfaces stay hidden rather than paint unstyled. A failed load removes
 * them, and the surfaces show without the sheet.
 *
 * Hidden with `opacity`, not `visibility`: a `visibility: hidden` element
 * cannot take focus, so a blocking banner's or the dialog's initial focus,
 * which runs as the surface mounts, would land nowhere and nothing would
 * place it once the sheet arrived. An element at opacity 0 keeps its
 * layout, its place in the accessibility tree, its focusability and its
 * clicks, so a tap on a control the sheet is about to style still counts.
 */
const PENDING_CSS =
	'@layer components{[data-testid^="consent-"],[data-testid^="iab-consent-"]{opacity:0!important}}';

/** Marks the element of a deferred sheet whose text is still loading. */
const PENDING_ATTRIBUTE = 'data-c15t-pending';

/**
 * Fills a deferred sheet's element with its text. A failed load empties
 * it and drops its id, so the surfaces show and the next one retries.
 */
const fillDeferred = async function fillDeferred(
	element: HTMLStyleElement,
	load: () => Promise<string>
): Promise<void> {
	try {
		element.textContent = await load();
		element.removeAttribute(PENDING_ATTRIBUTE);
	} catch {
		element.remove();
	}
};

/**
 * Insert each sheet the page does not hold yet into `<head>`, in order.
 *
 * Elements stay when the surface unmounts, so the next surface finds them.
 * A sheet `c15tHandle` already wrote into the page counts as held. A
 * deferred sheet the page lacks gets its element at once, in cascade
 * order, with its text once `load()` resolves; the stock surfaces stay
 * hidden until then.
 *
 * Without the provider's `nonce`, new elements take the nonce of a sheet
 * `c15tHandle` wrote, else of a page script: SvelteKit puts its nonce on
 * both, and never hands it to components.
 *
 * @param sheets - The surface's sheets, in cascade order.
 * @param nonce - CSP nonce for the new `<style>` elements.
 * @internal
 */
export const ensureSurfaceStyles = function ensureSurfaceStyles(
	sheets: readonly SurfaceStyleSheet[],
	nonce: string | undefined
): void {
	if (typeof document === 'undefined') {
		return;
	}
	const pageNonce =
		nonce ||
		document.head.querySelector<HTMLStyleElement>(`style[${STYLE_ATTRIBUTE}]`)
			?.nonce ||
		document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ||
		undefined;
	for (const sheet of sheets) {
		if (
			document.head.querySelector(`style[${STYLE_ATTRIBUTE}="${sheet.id}"]`)
		) {
			continue;
		}
		const element = document.createElement('style');
		element.setAttribute(STYLE_ATTRIBUTE, sheet.id);
		if (pageNonce) {
			element.nonce = pageNonce;
		}
		if (sheet.css || !sheet.load) {
			element.textContent = sheet.css;
		} else {
			element.setAttribute(PENDING_ATTRIBUTE, '');
			element.textContent = PENDING_CSS;
			void fillDeferred(element, sheet.load);
		}
		document.head.append(element);
	}
};
