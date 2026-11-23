/**
 * The prompt's and the dialog's element builder: event handlers travel
 * with the element, as `on<event>` properties, so a morph (`./morph.ts`)
 * can move them onto the mounted tree.
 *
 * @packageDocumentation
 * @internal
 */

/** A child the builder accepts. */
export type PartChild = Node | string | number | null | undefined | false;

/** Event handlers, set as `on<event>` properties so a morph can move them. */
export type PartHandlers = Partial<
	Record<
		'click' | 'focus' | 'keydown' | 'pointerdown' | 'pointerenter',
		(event: Event) => void
	>
>;

/** Attributes, with `on` for handlers and `ref` for the built element. */
export type PartProps = Record<
	string,
	string | number | boolean | null | undefined | PartHandlers | PartRef
> & {
	on?: PartHandlers;
	ref?: PartRef;
};

/** Receives the element that ends up mounted, after the morph. */
export interface PartRef {
	current: HTMLElement | null;
}

/** Built elements that hold content a controller owns (a live region). */
export const OWNED = new WeakSet<Node>();
/** The ref each built element asked for. */
export const REFS = new WeakMap<Node, PartRef>();

const SVG_NS = 'http://www.w3.org/2000/svg';

const append = function append(element: Element, children: PartChild[]): void {
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
	props: PartProps = {},
	...children: PartChild[]
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
