/**
 * Patches the live DOM to match a consent prompt tree (`vnode.model.ts`).
 * Patching keeps each node that stays (ARCH-01): the card, its head and
 * footer, and the control that has focus survive an expand, as they do in
 * React.
 *
 * @internal
 */

import type { VAttributes, VElement, VNode } from './vnode.model';

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
