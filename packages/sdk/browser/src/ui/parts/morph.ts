/**
 * A morph that patches the mounted tree to match a freshly built one.
 *
 * The surfaces render their whole tree from state, as the React port
 * does, and morph it onto what is mounted. Elements keep their node, and
 * with it focus, transitions and the shared controllers attached to them,
 * wherever the new tree has an element of the same kind and key (its
 * `data-testid` or `id`, else its place among its unkeyed siblings).
 *
 * @packageDocumentation
 * @internal
 */

import { OWNED, REFS } from './el';

const HANDLERS = [
	'onclick',
	'onfocus',
	'onkeydown',
	'onpointerdown',
	'onpointerenter',
] as const;

/**
 * Attributes a shared controller sets on a built element, never the
 * builder: the scroll-edge fades (LAY-08). A morph leaves them alone.
 */
const CONTROLLER_ATTRIBUTES = new Set(['data-fade-top', 'data-fade-bottom']);

const keyOf = function keyOf(node: Node): string | null {
	if (!(node instanceof Element)) {
		return null;
	}
	const testId = node.getAttribute('data-testid');
	if (testId) {
		return `t:${node.tagName}:${testId}`;
	}
	return node.id ? `i:${node.tagName}:${node.id}` : null;
};

const sameKind = (a: Node, b: Node): boolean =>
	a.nodeType === b.nodeType &&
	(!(a instanceof Element) ||
		(b instanceof Element && a.tagName === b.tagName));

const morphAttributes = function morphAttributes(
	from: Element,
	to: Element
): void {
	const keep = OWNED.has(from);
	if (!keep) {
		for (const { name } of [...from.attributes]) {
			if (!(to.hasAttribute(name) || CONTROLLER_ATTRIBUTES.has(name))) {
				from.removeAttribute(name);
			}
		}
	}
	for (const { name, value } of [...to.attributes]) {
		if (from.getAttribute(name) !== value) {
			from.setAttribute(name, value);
		}
	}
	for (const handler of HANDLERS) {
		const record = from as unknown as Record<string, unknown>;
		const next = (to as unknown as Record<string, unknown>)[handler] ?? null;
		if (record[handler] !== next) {
			record[handler] = next;
		}
	}
	if (from instanceof HTMLInputElement && to instanceof HTMLInputElement) {
		if (from.value !== to.value) {
			from.value = to.value;
		}
	}
};

const bindRefs = function bindRefs(built: Node, mounted: Node): void {
	const ref = REFS.get(built);
	if (ref) {
		ref.current = mounted as HTMLElement;
		REFS.set(mounted, ref);
	}
};

/** Bind the refs of a subtree mounted as built. */
const bindAll = function bindAll(node: Node): void {
	bindRefs(node, node);
	for (const child of node.childNodes) {
		bindAll(child);
	}
};

/**
 * Patch `from`, which is mounted, to match `to`, which is not.
 *
 * @returns The node now in place of `from`: `from` itself, or `to` when
 * their kinds differ.
 */
export const morph = function morph(from: Node, to: Node): Node {
	if (!sameKind(from, to) || keyOf(from) !== keyOf(to)) {
		from.parentNode?.replaceChild(to, from);
		bindAll(to);
		return to;
	}
	if (!(from instanceof Element && to instanceof Element)) {
		if (from.nodeValue !== to.nodeValue) {
			from.nodeValue = to.nodeValue;
		}
		return from;
	}
	morphAttributes(from, to);
	bindRefs(to, from);
	if (OWNED.has(from)) {
		OWNED.add(from);
		return from;
	}
	// oxlint-disable-next-line no-use-before-define -- `morph` and `morphChildren` recurse into each other.
	morphChildren(from, to);
	return from;
};

// oxlint-disable-next-line max-statements -- One pass over both child lists.
const morphChildren = function morphChildren(from: Element, to: Element): void {
	const incoming = [...to.childNodes];
	const existing = [...from.childNodes];
	const keyed = new Map<string, Node>();
	for (const node of existing) {
		const key = keyOf(node);
		if (key && !keyed.has(key)) {
			keyed.set(key, node);
		}
	}
	const used = new Set<Node>();
	let index = 0;
	for (const next of incoming) {
		const key = keyOf(next);
		let match: Node | undefined;
		if (key) {
			match = keyed.get(key);
		} else {
			match = existing.find(
				(node) =>
					!used.has(node) && keyOf(node) === null && sameKind(node, next)
			);
		}
		let placed: Node;
		if (match && !used.has(match) && sameKind(match, next)) {
			used.add(match);
			placed = morph(match, next);
		} else {
			placed = next;
			bindAll(next);
		}
		const current = from.childNodes[index] ?? null;
		if (current !== placed) {
			from.insertBefore(placed, current);
		}
		index += 1;
	}
	for (const node of existing) {
		if (!used.has(node) && node.parentNode === from) {
			node.remove();
		}
	}
	while (from.childNodes.length > incoming.length) {
		from.lastChild?.remove();
	}
};

/** Mount `built` in place of `mounted`, or morph `mounted` to match it. */
export const patch = function patch(
	mounted: HTMLElement | null,
	built: HTMLElement,
	parent: Node
): HTMLElement {
	if (!mounted?.isConnected) {
		parent.appendChild(built);
		bindAll(built);
		return built;
	}
	return morph(mounted, built) as HTMLElement;
};
