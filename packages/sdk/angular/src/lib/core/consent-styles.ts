/**
 * The stylesheets the stock Angular surfaces add themselves.
 *
 * An app that imports no Inth stylesheet still gets styled surfaces. Each
 * surface calls `ConsentStyles.ensure()` with the sheets it renders, before
 * its elements paint. The sheets go into `<head>` as `<style>` elements,
 * once per page. On the server the same elements land in the rendered HTML,
 * with the text of deferred sheets awaited through `PendingTasks`, so a
 * server-rendered banner is styled before the app boots and the browser
 * finds the sheets already there.
 *
 * @packageDocumentation
 */

import { isPlatformBrowser } from '@angular/common';
import {
	CSP_NONCE,
	DOCUMENT,
	inject,
	Injectable,
	PendingTasks,
	PLATFORM_ID,
} from '@angular/core';
import * as banner from '@inth/sdk/ui/styles/sheets/banner-deferred';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as consentGate from '@inth/sdk/ui/styles/sheets/consent-gate-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';
import * as trigger from '@inth/sdk/ui/styles/sheets/trigger-deferred';

import { ConsentTheme } from './consent-theme';

/** A stylesheet from `@inth/sdk/ui/styles/sheets/*`. */
export interface SurfaceStyleSheet {
	/** Dedupes the stylesheet: a page holds each `id` once. */
	readonly id: string;
	/** The stylesheet text. Empty for a deferred sheet. */
	readonly css: string;
	/** Loads the text of a deferred sheet. */
	readonly load?: () => Promise<string>;
}

/**
 * What the banner renders: the theme tokens, the button rules, and the
 * banner, branding, action and legal-link rules with the variables they read.
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

/**
 * The elements of each stock surface, by test id. A sheet that is still
 * loading hides only the surfaces that asked for it.
 */
export const SURFACE_SCOPES = {
	banner: '[data-testid^="consent-banner"]',
	dialog:
		'[data-testid^="consent-dialog"]:not([data-testid^="consent-dialog-trigger"]),[data-testid^="consent-widget"]',
	gate: '[data-testid^="consent-gate"]',
	iabBanner: '[data-testid^="iab-consent-banner"]',
	iabDialog: '[data-testid^="iab-consent-dialog"]',
	trigger: '[data-testid^="consent-dialog-trigger"]',
} as const;

/** Marks the `<style>` elements that hold a sheet; the value is its `id`. */
export const STYLE_ATTRIBUTE = 'data-inth-styles';

/** Every stock surface, for a caller that names none. */
const ANY_SURFACE = '[data-testid^="consent-"],[data-testid^="iab-consent-"]';

/**
 * The rule a deferred sheet's element holds until its text arrives: the
 * surfaces that asked for it stay hidden rather than paint unstyled, and
 * the rest keep showing. Hidden with `opacity`, not `visibility`, so
 * initial focus, the accessibility tree and clicks keep working while the
 * sheet loads.
 */
const pendingCss = (scopes: ReadonlySet<string>): string =>
	`@layer components{${[...scopes].join(',')}{opacity:0!important}}`;

/**
 * How long a deferred sheet may keep its surfaces hidden. A request that
 * hangs then shows them unstyled rather than never.
 */
export const PENDING_REVEAL_MS = 3000;

/** The surfaces each still-hiding deferred sheet's element hides. */
const pendingScopes = new WeakMap<Element, Set<string>>();

/** Marks the element of a deferred sheet whose text is still loading. */
const PENDING_ATTRIBUTE = 'data-inth-pending';

/**
 * Fills a deferred sheet's element with its text. A failed load removes
 * the element, so the surfaces show and the next one retries.
 */
const fillDeferred = async function fillDeferred(
	element: HTMLStyleElement,
	load: () => Promise<string>
): Promise<void> {
	try {
		element.textContent = await load();
		element.removeAttribute(PENDING_ATTRIBUTE);
		pendingScopes.delete(element);
	} catch {
		element.remove();
	}
};

/**
 * An element's CSP nonce. Browsers hide the attribute once the page has
 * loaded and keep the value on the property; a server DOM has only the
 * attribute.
 */
const nonceOf = function nonceOf(element: Element | null): string | undefined {
	if (!element) {
		return undefined;
	}
	return (
		(element as HTMLElement).nonce || element.getAttribute('nonce') || undefined
	);
};

/**
 * Insert each sheet the document does not hold yet into `<head>`, in order.
 *
 * Elements stay when the surface is destroyed, so the next surface finds
 * them. Without a `nonce`, new elements take the nonce of an earlier Inth
 * sheet, else of a page script.
 *
 * @param sheets - The surface's sheets, in cascade order.
 * @param nonce - CSP nonce for the new `<style>` elements.
 * @param scope - The elements of the surface asking, which a deferred sheet
 * hides until it loads. One of {@link SURFACE_SCOPES}; defaults to every
 * stock surface.
 * @param track - Wraps each deferred load, so a server render can wait for
 * it. Defaults to running it untracked.
 * @param revealAfterMs - Shows the surfaces this long after a deferred sheet
 * started loading, loaded or not. `null` waits for the load, as a server
 * render does.
 * @internal
 */
export const ensureSurfaceStyles = function ensureSurfaceStyles(
	document: Document,
	sheets: readonly SurfaceStyleSheet[],
	nonce: string | undefined,
	scope: string = ANY_SURFACE,
	track: (load: () => Promise<void>) => void = (load) => {
		void load();
	},
	revealAfterMs: number | null = PENDING_REVEAL_MS
): void {
	const { head } = document;
	if (!head) {
		return;
	}
	const pageNonce =
		nonce ||
		nonceOf(head.querySelector(`style[${STYLE_ATTRIBUTE}]`)) ||
		nonceOf(document.querySelector('script[nonce]'));
	for (const sheet of sheets) {
		const existing = head.querySelector(
			`style[${STYLE_ATTRIBUTE}="${sheet.id}"]`
		);
		if (existing) {
			// Still loading: it hides this surface too.
			const scopes = pendingScopes.get(existing);
			if (scopes && !scopes.has(scope)) {
				scopes.add(scope);
				existing.textContent = pendingCss(scopes);
			}
			continue;
		}
		const element = document.createElement('style');
		element.setAttribute(STYLE_ATTRIBUTE, sheet.id);
		if (pageNonce) {
			// The attribute, so a server-rendered document serializes it.
			element.setAttribute('nonce', pageNonce);
		}
		if (sheet.css || !sheet.load) {
			element.textContent = sheet.css;
		} else {
			element.setAttribute(PENDING_ATTRIBUTE, '');
			const scopes = new Set([scope]);
			pendingScopes.set(element, scopes);
			element.textContent = pendingCss(scopes);
			const { load } = sheet;
			track(() => fillDeferred(element, load));
			if (revealAfterMs !== null) {
				setTimeout(() => {
					if (pendingScopes.delete(element)) {
						// The text arrives when it does; until then, show unstyled.
						element.textContent = '';
					}
				}, revealAfterMs);
			}
		}
		// `appendChild`: the server DOM (domino) has no `append`.
		head.appendChild(element);
	}
};

/**
 * Adds the stock surfaces' stylesheets to the page.
 *
 * Provided by `provideInth()`. A surface calls {@link ConsentStyles.ensure}
 * before its first render with the sheets it renders and its resolved
 * `noStyle`.
 *
 * @example
 * ```ts
 * export class ConsentBanner {
 *   readonly #styles = inject(ConsentStyles);
 *   ngOnInit() {
 *     this.#styles.ensure(
 *       BANNER_SHEETS,
 *       this.resolvedNoStyle(),
 *       SURFACE_SCOPES.banner
 *     );
 *   }
 * }
 * ```
 */
@Injectable()
export class ConsentStyles {
	readonly #document = inject(DOCUMENT);
	readonly #theme = inject(ConsentTheme);
	readonly #pendingTasks = inject(PendingTasks);
	readonly #browser = isPlatformBrowser(inject(PLATFORM_ID));
	readonly #cspNonce = inject(CSP_NONCE, { optional: true });

	/**
	 * Inserts the sheets the page does not hold yet, unless the provider's
	 * `styles: false` is set or the surface drops its stock classes.
	 *
	 * @param sheets - The surface's sheets, in cascade order.
	 * @param noStyle - The surface's resolved `noStyle`: its own input, else
	 * the provider's.
	 * @param scope - The surface's elements, from {@link SURFACE_SCOPES}: a
	 * sheet still loading hides these and no other surface.
	 */
	ensure(
		sheets: readonly SurfaceStyleSheet[],
		noStyle: boolean,
		scope: string
	): void {
		if (this.#theme.styles() === false || noStyle) {
			return;
		}
		const nonce = this.#theme.nonce() ?? this.#cspNonce ?? undefined;
		ensureSurfaceStyles(
			this.#document,
			sheets,
			nonce,
			scope,
			this.#browser
				? undefined
				: (load) => {
						// The server render waits for the text, so it is in the HTML.
						void this.#pendingTasks.run(load);
					},
			this.#browser ? PENDING_REVEAL_MS : null
		);
	}
}
