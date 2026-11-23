/**
 * DOM helpers that see through shadow roots, so the surface controllers
 * work the same in the page and inside the script-tag build's shadow root.
 *
 * @internal
 */

/** The focused element, descending through open shadow roots. */
export const deepActiveElement = function deepActiveElement(
	doc: Document
): Element | null {
	let active = doc.activeElement;
	while (active?.shadowRoot?.activeElement) {
		active = active.shadowRoot.activeElement;
	}
	return active;
};

/** Whether `node` is `target` or inside it, crossing shadow roots. */
export const containsComposed = function containsComposed(
	target: Node,
	node: Node | null
): boolean {
	let current: Node | null = node;
	while (current) {
		if (current === target || target.contains(current)) {
			return true;
		}
		const root = current.getRootNode();
		current = root instanceof ShadowRoot ? root.host : null;
	}
	return false;
};

/** The parent of `node`, stepping from a shadow root to its host. */
export const composedParent = function composedParent(
	node: Node
): Element | null {
	if (node.parentElement) {
		return node.parentElement;
	}
	const root = node.parentNode;
	return root instanceof ShadowRoot ? root.host : null;
};
