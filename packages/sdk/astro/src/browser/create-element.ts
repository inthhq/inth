type Attributes = Record<string, string | undefined>;

/**
 * Create an element, skipping undefined attributes.
 */
export const createElement = function createElement(
	tag: string,
	attributes: Attributes,
	children: (Node | string)[] = []
): HTMLElement {
	const node = document.createElement(tag);
	for (const [name, value] of Object.entries(attributes)) {
		if (value !== undefined) {
			node.setAttribute(name, value);
		}
	}
	node.append(...children);
	return node;
};
