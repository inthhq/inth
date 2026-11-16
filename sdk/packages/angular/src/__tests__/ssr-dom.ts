/** Compare actual prompt and persistent trigger elements across portal relocation.
 * Only Angular's hydration markers are removed (comment nodes and the `ngh`
 * attribute the server adds); other elements, attributes and text remain.
 */
export const serializeConsentDom = function serializeConsentDom(
	root: ParentNode
): string {
	return ['consent-banner-root', 'consent-dialog-trigger']
		.map((id) => {
			const element = root.querySelector(`[data-testid="${id}"]`);
			if (!element) {
				return '';
			}
			const clone = element.cloneNode(true) as Element;
			const removeComments = (node: Node) => {
				// Not `instanceof Element`: the server render in this process
				// swaps the DOM globals, so jsdom nodes fail that check.
				if (node.nodeType === Node.ELEMENT_NODE) {
					const target = node as Element;
					const attributes = [...target.attributes]
						.map(({ name, value }) => [name, value] as const)
						.sort(([left], [right]) => left.localeCompare(right));
					for (const attribute of [...target.attributes]) {
						target.removeAttribute(attribute.name);
					}
					for (const [name, value] of attributes) {
						if (name !== 'ngh') {
							target.setAttribute(name, value);
						}
					}
				}
				for (const child of [...node.childNodes]) {
					if (child.nodeType === Node.COMMENT_NODE) {
						child.remove();
					} else {
						removeComments(child);
					}
				}
			};
			removeComments(clone);
			return clone.outerHTML;
		})
		.join('');
};

/** Measure visibility through the rendered element and every actual ancestor. */
export const isConsentElementVisible = (element: Element | null): boolean => {
	if (!element) {
		return false;
	}
	for (
		let current: Element | null = element;
		current;
		current = current.parentElement
	) {
		const style = getComputedStyle(current);
		if (
			current.hasAttribute('hidden') ||
			style.display === 'none' ||
			style.visibility === 'hidden' ||
			style.visibility === 'collapse' ||
			style.opacity === '0'
		) {
			return false;
		}
	}
	return true;
};
