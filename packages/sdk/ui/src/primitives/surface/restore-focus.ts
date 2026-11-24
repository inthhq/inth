/**
 * Focus return for a closing consent surface (FOC-03).
 *
 * An opener that is still in the page cannot always take focus back: the
 * page may have hidden it with CSS, or it may sit in a part that is now
 * inert. Each candidate is focused in turn, and kept only when focus
 * actually landed on it, so a hidden "Your Privacy Choices" link hands
 * focus on to a visible trigger instead of leaving it on the body.
 *
 * @packageDocumentation
 * @internal
 */

import { deepActiveElement } from './composed-tree.model';

/** Options for {@link restoreFocus}. */
export interface RestoreFocusOptions {
	/** The element that had focus when the surface opened. Tried first. */
	opener?: Element | null;
	/**
	 * Page controls to try when the opener cannot take focus, in order,
	 * such as "Your Privacy Choices" and the floating trigger.
	 */
	fallbacks?: readonly string[];
	/**
	 * A node inside the UI root, which may be a shadow root the page cannot
	 * query into. Fallbacks are looked up in the page, then there.
	 */
	root?: Node | null;
}

const fallbackCandidates = function* fallbackCandidates(
	selectors: readonly string[],
	root: Node | null | undefined
): Generator<Element> {
	const uiRoot = root?.getRootNode();
	const shadow = uiRoot instanceof ShadowRoot ? uiRoot : null;
	for (const selector of selectors) {
		yield* document.querySelectorAll(selector);
		if (shadow) {
			yield* shadow.querySelectorAll(selector);
		}
	}
};

/**
 * Focus `element` and report whether focus landed on it. A detached
 * element, the body, or one the browser refuses (hidden, inert, disabled)
 * does not count.
 */
export const takesFocus = function takesFocus(
	element: Element | null
): boolean {
	if (
		!(element instanceof HTMLElement) ||
		!element.isConnected ||
		element === element.ownerDocument.body
	) {
		return false;
	}
	element.focus({ preventScroll: true });
	return deepActiveElement(element.ownerDocument) === element;
};

/**
 * Return focus to the opener, or to the first fallback that takes it.
 *
 * @returns The element that took focus, or `null` when none did.
 */
export const restoreFocus = function restoreFocus({
	opener = null,
	fallbacks = [],
	root,
}: RestoreFocusOptions): HTMLElement | null {
	if (takesFocus(opener)) {
		return opener as HTMLElement;
	}
	for (const candidate of fallbackCandidates(fallbacks, root)) {
		if (candidate !== opener && takesFocus(candidate)) {
			return candidate as HTMLElement;
		}
	}
	return null;
};
