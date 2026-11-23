/**
 * The Privacy Choices surfaces' DOM helpers: an element builder whose
 * event handlers travel with the element, and a morph that patches the
 * mounted tree to match a freshly built one.
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

/** A child the builder accepts. */
export type PcChild = Node | string | number | null | undefined | false;

/** Event handlers, set as `on<event>` properties so a morph can move them. */
export type PcHandlers = Partial<
	Record<
		'click' | 'focus' | 'keydown' | 'pointerdown' | 'pointerenter',
		(event: Event) => void
	>
>;

/** Attributes, with `on` for handlers and `ref` for the built element. */
export type PcProps = Record<
	string,
	string | number | boolean | null | undefined | PcHandlers | PcRef
> & {
	on?: PcHandlers;
	ref?: PcRef;
};

/** Receives the element that ends up mounted, after the morph. */
export interface PcRef {
	current: HTMLElement | null;
}

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

/** Built elements that hold content a controller owns (a live region). */
const OWNED = new WeakSet<Node>();
/** The ref each built element asked for. */
const REFS = new WeakMap<Node, PcRef>();

const SVG_NS = 'http://www.w3.org/2000/svg';

const append = function append(element: Element, children: PcChild[]): void {
	for (const child of children) {
		if (child === null || child === undefined || child === false) {
			continue;
		}
		element.append(
			typeof child === 'string' || typeof child === 'number'
				? document.createTextNode(String(child))
				: child
		);
	}
};

/**
 * Build an element. `false`, `null` and `undefined` attributes are left
 * off, `true` sets an empty one; `class` is left off when blank, as with
 * `noStyle`.
 */
export const el = function el<TagName extends keyof HTMLElementTagNameMap>(
	tag: TagName,
	props: PcProps = {},
	...children: PcChild[]
): HTMLElementTagNameMap[TagName] {
	const element = document.createElement(tag);
	for (const [name, value] of Object.entries(props)) {
		if (name === 'on' || name === 'ref') {
			continue;
		}
		if (value === null || value === undefined || value === false) {
			continue;
		}
		if (name === 'class' && String(value).trim() === '') {
			continue;
		}
		element.setAttribute(name, value === true ? '' : String(value));
	}
	for (const [event, handler] of Object.entries(props.on ?? {})) {
		(element as unknown as Record<string, unknown>)[`on${event}`] = handler;
	}
	if (props.ref) {
		REFS.set(element, props.ref);
	}
	append(element, children);
	return element;
};

/**
 * Mark an element whose content and added attributes a controller owns,
 * such as a status region: a morph never clears them.
 */
export const owned = function owned<ElementType extends HTMLElement>(
	element: ElementType
): ElementType {
	OWNED.add(element);
	return element;
};

/** A stroked 24×24 icon, decorative, as the React port draws them. */
export const icon = function icon(
	size: number,
	paths: readonly string[],
	options: { strokeWidth?: string; rect?: Record<string, string> } = {}
): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg');
	const attrs: Record<string, string> = {
		'aria-hidden': 'true',
		fill: 'none',
		height: String(size),
		stroke: 'currentColor',
		'stroke-linecap': 'round',
		'stroke-linejoin': 'round',
		'stroke-width': options.strokeWidth ?? '2',
		viewBox: '0 0 24 24',
		width: String(size),
	};
	for (const [name, value] of Object.entries(attrs)) {
		svg.setAttribute(name, value);
	}
	if (options.rect) {
		const rect = document.createElementNS(SVG_NS, 'rect');
		for (const [name, value] of Object.entries(options.rect)) {
			rect.setAttribute(name, value);
		}
		svg.append(rect);
	}
	for (const d of paths) {
		const path = document.createElementNS(SVG_NS, 'path');
		path.setAttribute('d', d);
		svg.append(path);
	}
	return svg;
};

/** Class names unless `noStyle`, dropping blanks; `undefined` when none. */
export const cx = function cx(
	noStyle: boolean | undefined,
	...names: (string | undefined | null | false)[]
): string | undefined {
	if (noStyle) {
		return undefined;
	}
	return names.filter(Boolean).join(' ') || undefined;
};

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
