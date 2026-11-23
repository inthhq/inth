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

/** Remembers the trusted markup an element was last given. */
const writtenHTML = new WeakMap<Element, string>();

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Build a DOM node from a tree node. */
const createNode = function createNode(
	node: VNode,
	document: Document,
	svg: boolean
): Node {
	if (typeof node === 'string') {
		return document.createTextNode(node);
	}
	const inSvg = svg || node.tag === 'svg';
	const element = inSvg
		? document.createElementNS(SVG_NAMESPACE, node.tag)
		: document.createElement(node.tag);
	for (const [name, value] of Object.entries(node.attrs)) {
		if (value !== undefined) {
			element.setAttribute(name, value);
		}
	}
	if (node.html === undefined) {
		for (const child of node.children) {
			element.append(createNode(child, document, inSvg));
		}
	} else {
		element.innerHTML = node.html;
		writtenHTML.set(element, node.html);
	}
	return element;
};

/** Bring an element's attributes in line with a tree node. */
const patchAttributes = function patchAttributes(
	element: Element,
	attrs: VAttributes
): void {
	for (const { name } of [...element.attributes]) {
		if (attrs[name] === undefined) {
			element.removeAttribute(name);
		}
	}
	for (const [name, value] of Object.entries(attrs)) {
		if (value !== undefined && element.getAttribute(name) !== value) {
			element.setAttribute(name, value);
		}
	}
};

/**
 * The identity a node keeps across renders: its `id`, else its
 * `data-testid`, else its `data-category`. Unkeyed nodes match by
 * position among unkeyed nodes of the same tag.
 */
const keyOf = function keyOf(node: Node | VNode): string | null {
	if (typeof node === 'string') {
		return null;
	}
	if ('attrs' in node) {
		return (
			node.attrs.id ??
			node.attrs['data-testid'] ??
			node.attrs['data-category'] ??
			null
		);
	}
	if (node.nodeType !== 1) {
		return null;
	}
	const element = node as Element;
	return (
		element.getAttribute('id') ??
		element.getAttribute('data-testid') ??
		element.getAttribute('data-category')
	);
};

const sameKind = function sameKind(node: Node, next: VNode): boolean {
	if (typeof next === 'string') {
		return node.nodeType === 3;
	}
	return (
		node.nodeType === 1 &&
		(node as Element).localName === next.tag &&
		keyOf(node) === keyOf(next)
	);
};

/**
 * Patch `parent`'s children to match `nodes`, keeping each node whose tag
 * and key still match, so focus and running transitions survive.
 *
 * @param parent - The element whose children to patch.
 * @param nodes - What its children should be.
 */
export const patchChildren = function patchChildren(
	parent: Element,
	nodes: readonly VNode[]
): void {
	const document = parent.ownerDocument;
	const svg = parent.namespaceURI === SVG_NAMESPACE;
	const old = [...parent.childNodes];
	const used = new Set<Node>();
	const keyed = new Map<string, Node>();
	for (const node of old) {
		const key = keyOf(node);
		if (key !== null && !keyed.has(key)) {
			keyed.set(key, node);
		}
	}
	let cursor = 0;
	const takeUnkeyed = (next: VNode): Node | null => {
		for (let index = cursor; index < old.length; index += 1) {
			const candidate = old[index] as Node;
			if (used.has(candidate) || keyOf(candidate) !== null) {
				continue;
			}
			if (sameKind(candidate, next)) {
				cursor = index + 1;
				return candidate;
			}
			// Comments and other node types are never matched.
			if (candidate.nodeType !== 1 && candidate.nodeType !== 3) {
				continue;
			}
			return null;
		}
		return null;
	};

	let reference: Node | null = parent.firstChild;
	for (const next of nodes) {
		const key = keyOf(next);
		let match: Node | null = null;
		if (key === null) {
			match = takeUnkeyed(next);
		} else {
			const candidate = keyed.get(key);
			if (candidate && !used.has(candidate) && sameKind(candidate, next)) {
				match = candidate;
			}
		}
		let node: Node;
		if (match) {
			used.add(match);
			// oxlint-disable-next-line no-use-before-define -- Mutually recursive with patchNode.
			patchNode(match, next);
			node = match;
		} else {
			node = createNode(next, document, svg);
		}
		if (node === reference) {
			reference = reference.nextSibling;
			continue;
		}
		parent.insertBefore(node, reference);
		reference = node.nextSibling;
	}
	for (const node of old) {
		if (!used.has(node) && node.parentNode === parent) {
			node.remove();
		}
	}
};

/** Bring one matched node in line with its tree node. */
const patchNode = function patchNode(node: Node, next: VNode): void {
	if (typeof next === 'string') {
		if (node.nodeValue !== next) {
			node.nodeValue = next;
		}
		return;
	}
	const element = node as Element;
	patchAttributes(element, next.attrs);
	if (next.html !== undefined) {
		if (writtenHTML.get(element) !== next.html) {
			element.innerHTML = next.html;
			writtenHTML.set(element, next.html);
		}
		return;
	}
	patchChildren(element, next.children);
};

/**
 * Patch one element in place, attributes and children, to match `next`.
 * The tag must match; the caller owns the element itself.
 */
export const patchElement = function patchElement(
	element: Element,
	next: VElement
): void {
	patchNode(element, next);
};
