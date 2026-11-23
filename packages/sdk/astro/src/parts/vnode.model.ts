/**
 * One description of the consent prompt's markup for both renderings.
 *
 * The server writes it as HTML into the page, and the browser patches the
 * live DOM to match it after every change. Patching keeps each node that
 * stays (ARCH-01): the card, its head and footer, and the control that
 * has focus survive an expand, as they do in React.
 *
 * Listeners never live in the tree. The browser controller listens on the
 * root and reads the `data-testid` or `data-*` attribute a control already
 * carries, so the server HTML needs no hydration step and the markup has
 * no attribute React's does not.
 *
 * @internal
 */

/** Attribute values. `undefined` leaves the attribute out. */
export type VAttributes = Record<string, string | undefined>;

/** An element in the tree. */
export interface VElement {
	readonly tag: string;
	readonly attrs: VAttributes;
	readonly children: readonly VNode[];
	/**
	 * Trusted inner markup from Inth's own icon builders, written as is in
	 * place of `children`.
	 */
	readonly html?: string;
}

/** Anything a child list may hold; `null`, `false` and `undefined` render nothing. */
export type VChild = VElement | string | null | false | undefined | VChild[];

/** A rendered child: an element or text. */
export type VNode = VElement | string;

/** Flatten a child list, dropping the empty entries. */
const flatten = function flatten(children: readonly VChild[]): VNode[] {
	const out: VNode[] = [];
	for (const child of children) {
		if (child === null || child === false || child === undefined) {
			continue;
		}
		if (Array.isArray(child)) {
			out.push(...flatten(child));
		} else if (child !== '') {
			out.push(child);
		}
	}
	return out;
};

/**
 * Describe an element.
 *
 * @param tag - The tag name, lower case.
 * @param attrs - Attributes; `undefined` values are left out.
 * @param children - Elements and text, in order.
 */
export const h = function h(
	tag: string,
	attrs: VAttributes,
	...children: VChild[]
): VElement {
	return { attrs, children: flatten(children), tag };
};

/**
 * An element whose content is trusted static markup, such as an icon.
 *
 * @param html - Inth's own markup. Never visitor or site text.
 */
export const raw = function raw(
	tag: string,
	attrs: VAttributes,
	html: string
): VElement {
	return { attrs, children: [], html, tag };
};

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'link', 'meta']);

const escapeText = (text: string): string =>
	text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

const escapeAttribute = (text: string): string =>
	escapeText(text).replace(/"/gu, '&quot;');

/**
 * Serialize nodes as HTML, for the server render.
 *
 * @param nodes - The nodes, in order.
 */
export const toHTML = function toHTML(nodes: readonly VNode[]): string {
	let out = '';
	for (const node of nodes) {
		if (typeof node === 'string') {
			out += escapeText(node);
			continue;
		}
		out += `<${node.tag}`;
		for (const [name, value] of Object.entries(node.attrs)) {
			if (value !== undefined) {
				out +=
					value === '' ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`;
			}
		}
		out += '>';
		if (VOID_TAGS.has(node.tag)) {
			continue;
		}
		out += node.html ?? toHTML(node.children);
		out += `</${node.tag}>`;
	}
	return out;
};
