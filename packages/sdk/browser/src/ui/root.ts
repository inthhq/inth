/**
 * The element the stock UI renders into: a `[data-inth-ui]` host, by
 * default with a shadow root holding the stylesheet, a `.inth-host`
 * wrapper and the `.inth-theme-root` the surfaces append to.
 *
 * Shared by `mountConsentUI` and the init script's banner, so the engine
 * can take over the root the init script mounted.
 */
import type { ConsentUIOptions } from '../types';
import { h } from './dom';

const HOST_ATTRIBUTE = 'data-inth-ui';

/** A mounted UI root. */
export interface UIRoot {
	host: HTMLElement;
	root: ShadowRoot | HTMLElement;
	wrapper: HTMLElement;
	themeRoot: HTMLElement;
	/** The stock `<style>`, when there is one. */
	style: HTMLStyleElement | null;
	releaseScheme: () => void;
}

/**
 * Shadow content is not a child, so the host matches `:empty`, and themes
 * such as Shopify's Dawn hide `div:empty`. Page rules beat `:host`, so only
 * an inline `!important` keeps the host displayed.
 */
const attachShadowRoot = function attachShadowRoot(
	host: HTMLElement
): ShadowRoot {
	host.style.setProperty('display', 'block', 'important');
	return host.attachShadow({ mode: 'open' });
};

/**
 * A `<style>` carrying the client's nonce: a nonce-based `style-src`
 * blocks an unnonced one, even in a shadow root.
 *
 * @param text - The sheet.
 * @param nonce - The page's CSP nonce.
 * @returns The element.
 */
export const createStyle = function createStyle(
	text: string,
	nonce: string | undefined
): HTMLStyleElement {
	const style = h('style', {}, text);
	if (nonce) {
		style.nonce = nonce;
	}
	return style;
};

/**
 * Follow the configured colour scheme on the UI wrapper.
 *
 * The stylesheet keys dark tokens off a `.inth-dark` ancestor of
 * `.inth-theme-root`; inside a shadow root nothing on `<html>` reaches
 * it, so the wrapper carries the class itself. For the same reason `null`
 * cannot simply leave the class alone, as it does in the framework
 * providers: the page's class would never reach the UI. It copies it
 * instead, from either `dark` or `inth-dark` on `<html>`.
 *
 * @param wrapper - The `.inth-host` wrapper.
 * @param host - The host element.
 * @param scheme - The configured scheme.
 * @returns Stops following it.
 */
export const applyColorScheme = function applyColorScheme(
	wrapper: HTMLElement,
	host: HTMLElement,
	scheme: Exclude<ConsentUIOptions['colorScheme'], undefined>
): () => void {
	const set = function set(dark: boolean): void {
		// The wrapper serves `.inth-dark .inth-theme-root`; the host serves the
		// `:host(.inth-dark)` variants the generated sheet adds for `:root`.
		wrapper.classList.toggle('inth-dark', dark);
		host.classList.toggle('inth-dark', dark);
		host.style.colorScheme = dark ? 'dark' : 'light';
	};
	if (scheme === null) {
		const html = document.documentElement;
		const follow = function follow(): void {
			set(
				html.classList.contains('dark') || html.classList.contains('inth-dark')
			);
		};
		follow();
		const observer = new MutationObserver(follow);
		observer.observe(html, { attributeFilter: ['class'] });
		return () => {
			observer.disconnect();
		};
	}
	if (scheme !== 'system' || typeof window.matchMedia !== 'function') {
		set(scheme === 'dark');
		return () => {
			/* nothing to release */
		};
	}
	const query = window.matchMedia('(prefers-color-scheme: dark)');
	const onChange = function onChange(): void {
		set(query.matches);
	};
	onChange();
	query.addEventListener('change', onChange);
	return () => {
		query.removeEventListener('change', onChange);
	};
};

/**
 * Build the UI root and append it to `container`.
 *
 * @param container - Where the host goes.
 * @param options - Shadow and colour-scheme options.
 * @param styleText - The stock sheet; empty for none.
 * @param nonce - The page's CSP nonce.
 * @param beforeContent - Called with the root after the `<style>` and
 * before the wrapper, for `stylesheetUrls` links.
 * @returns The root.
 */
export const createUIRoot = function createUIRoot(
	container: HTMLElement,
	options: Pick<ConsentUIOptions, 'colorScheme' | 'shadow'>,
	styleText: string,
	nonce: string | undefined,
	beforeContent?: (root: ShadowRoot | HTMLElement) => void
): UIRoot {
	const host = h('div', { [HOST_ATTRIBUTE]: '' });
	const root: ShadowRoot | HTMLElement =
		(options.shadow ?? true) ? attachShadowRoot(host) : host;
	const style = styleText ? createStyle(styleText, nonce) : null;
	if (style) {
		root.append(style);
	}
	beforeContent?.(root);
	const wrapper = h('div', { class: 'inth-host' });
	const themeRoot = h('div', { class: 'inth-theme-root' });
	wrapper.append(themeRoot);
	root.append(wrapper);
	container.append(host);
	return {
		host,
		releaseScheme: applyColorScheme(
			wrapper,
			host,
			// `'system'` rather than the React provider's `.dark` mirroring: a
			// plain HTML page has no `.dark` convention, and a page that has
			// one opts in with `null`.
			options.colorScheme === undefined ? 'system' : options.colorScheme
		),
		root,
		style,
		themeRoot,
		wrapper,
	};
};
