/**
 * Focus trap for the top layer of a consent surface.
 *
 * Only the top layer is modal (FOC-01, NEST-03): with a phone sheet open
 * over the dialog, Tab cycles inside the sheet and the dialog below is
 * inert. Traps stack per document, newest on top, so closing a sheet hands
 * the trap back to the layer beneath without the renderer re-attaching it.
 *
 * @packageDocumentation
 */

import { tabbableElements } from '../../utils/dom';
import { containsComposed, deepActiveElement } from './composed-tree.model';

/** Options for {@link attachTopLayerTrap}. */
export interface TopLayerTrapOptions {
	/**
	 * Where focus goes when the trap attaches: an element (the dialog's
	 * `tabindex="-1"` title, FOC-03; a confirmation's Cancel, RIGHT-06),
	 * `'first-tabbable'`, or `'none'` to leave focus where it is. Defaults to
	 * `'none'`.
	 */
	initialFocus?: HTMLElement | 'first-tabbable' | 'none' | null;
	/**
	 * Where focus goes when the trap is disposed, such as the row that
	 * opened a sheet (NEST-04). Read at dispose time, so it may be a
	 * function. Defaults to leaving focus alone.
	 */
	returnFocus?: HTMLElement | null | (() => HTMLElement | null);
}

interface TrapStack {
	layers: HTMLElement[];
	onKeyDown: (event: KeyboardEvent) => void;
}

const stacks = new WeakMap<Document, TrapStack>();

const focus = (element: HTMLElement | null | undefined): void => {
	element?.focus({ preventScroll: true });
};

/**
 * Where Tab or Shift+Tab goes from `active` inside `layer`, or `null` to
 * let the browser move focus itself.
 *
 * Focus that sits on a node outside the tab order, such as a title with
 * `tabindex="-1"`, moves to the next or previous tabbable element in
 * document order. Before this, Shift+Tab from the focused title escaped to
 * the page (FOC-01).
 */
export const nextTopLayerStop = function nextTopLayerStop(
	layer: HTMLElement,
	active: Element | null,
	backwards: boolean
): HTMLElement | null {
	const stops = tabbableElements(layer);
	const [first] = stops;
	const last = stops[stops.length - 1];
	if (!first || !last) {
		return null;
	}
	const index = active instanceof HTMLElement ? stops.indexOf(active) : -1;
	if (index === -1) {
		if (!(active && containsComposed(layer, active))) {
			return backwards ? last : first;
		}
		// Document order inside the layer; the layer itself comes first.
		const order = [layer, ...layer.querySelectorAll('*')];
		const at = order.indexOf(active);
		if (backwards) {
			const before = stops.filter((stop) => order.indexOf(stop) < at);
			return before[before.length - 1] ?? last;
		}
		return stops.find((stop) => order.indexOf(stop) > at) ?? first;
	}
	if (backwards && index === 0) {
		return last;
	}
	if (!backwards && index === stops.length - 1) {
		return first;
	}
	// A positive tabindex lets the browser jump anywhere in the page, so
	// step through the trap's own list instead.
	if (stops.some((stop) => stop.tabIndex > 0)) {
		return stops[index + (backwards ? -1 : 1)] ?? null;
	}
	return null;
};

const stackFor = function stackFor(doc: Document): TrapStack {
	let stack = stacks.get(doc);
	if (!stack) {
		const created: TrapStack = {
			layers: [],
			onKeyDown(event) {
				const top = created.layers[created.layers.length - 1];
				if (!top || event.key !== 'Tab' || event.defaultPrevented) {
					return;
				}
				const target = nextTopLayerStop(
					top,
					deepActiveElement(doc),
					event.shiftKey
				);
				if (target) {
					event.preventDefault();
					focus(target);
				}
			},
		};
		stack = created;
		stacks.set(doc, created);
		doc.addEventListener('keydown', created.onKeyDown);
	}
	return stack;
};

/**
 * Trap Tab inside `layer` while it is the top layer.
 *
 * @param layer - The top card or sheet, or the blocking banner shell
 * (PERM-08). It may sit inside a shadow root.
 * @returns Stops trapping, and hands the trap to the layer beneath.
 */
export const attachTopLayerTrap = function attachTopLayerTrap(
	layer: HTMLElement,
	options: TopLayerTrapOptions = {}
): () => void {
	const doc = layer.ownerDocument;
	const stack = stackFor(doc);
	stack.layers.push(layer);
	const { initialFocus = 'none' } = options;
	if (initialFocus === 'first-tabbable') {
		focus(tabbableElements(layer)[0] ?? null);
	} else if (initialFocus instanceof HTMLElement) {
		focus(initialFocus);
	}
	let disposed = false;
	return () => {
		if (disposed) {
			return;
		}
		disposed = true;
		const index = stack.layers.lastIndexOf(layer);
		if (index !== -1) {
			stack.layers.splice(index, 1);
		}
		if (stack.layers.length === 0) {
			doc.removeEventListener('keydown', stack.onKeyDown);
			stacks.delete(doc);
		}
		const { returnFocus } = options;
		focus(typeof returnFocus === 'function' ? returnFocus() : returnFocus);
	};
};
