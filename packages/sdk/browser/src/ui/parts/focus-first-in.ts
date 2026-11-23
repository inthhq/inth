/**
 * Focus helpers for the prompt and the dialog that look into the shadow
 * root the UI may mount in.
 *
 * @packageDocumentation
 * @internal
 */

/** The focused element, looking into the shadow root `node` belongs to. */
export const activeElementOf = function activeElementOf(
	node: Node | null | undefined
): Element | null {
	const root = node?.getRootNode() as Document | ShadowRoot | undefined;
	return root?.activeElement ?? document.activeElement;
};

/**
 * The first element matching `selector` in the page, then in the UI root,
 * which may be a shadow root the page cannot query into.
 */
export const findInPage = function findInPage<
	ElementType extends HTMLElement = HTMLElement,
>(selector: string, uiRoot: Node | null | undefined): ElementType | null {
	const inDocument = document.querySelector<ElementType>(selector);
	if (inDocument) {
		return inDocument;
	}
	const root = uiRoot?.getRootNode();
	return root && root !== document && 'querySelector' in root
		? (root as ShadowRoot).querySelector<ElementType>(selector)
		: null;
};

/**
 * Focus the first element matching `selector`, in the page then in the UI
 * root, that takes focus. A match that cannot, such as one inside a
 * hidden footer, is skipped.
 *
 * @returns The element that took focus, or `null`.
 */
export const focusFirstIn = function focusFirstIn(
	selector: string,
	uiRoot: Node | null | undefined
): HTMLElement | null {
	const root = uiRoot?.getRootNode();
	const matches = [
		...document.querySelectorAll<HTMLElement>(selector),
		...(root && root !== document && 'querySelectorAll' in root
			? (root as ShadowRoot).querySelectorAll<HTMLElement>(selector)
			: []),
	];
	for (const target of matches) {
		target.focus({ preventScroll: true });
		if (activeElementOf(target) === target) {
			return target;
		}
	}
	return null;
};
