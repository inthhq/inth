/**
 * Block the page behind a modal consent surface: everything outside the
 * surface is `inert`, and the document stops scrolling (FOC-02, BNR-13).
 *
 * The caller decides when. A blocking banner and an open dialog block;
 * nothing blocks under the US opt-out preset, which the layout resolver's
 * `blocking` already says.
 *
 * @packageDocumentation
 */

import { setupScrollLock } from '../../utils/dom';
import { composedParent } from './composed-tree.model';

/** Options for {@link attachPageBlock}. */
export interface PageBlockOptions {
	/** Lock document scrolling, keeping the scrollbar gutter. Defaults to `true`. */
	scrollLock?: boolean;
}

interface DocumentBlocks {
	/** Surfaces blocking the page, oldest first. The newest one decides. */
	surfaces: HTMLElement[];
	/** Elements this module made inert, so it never clears a page's own `inert`. */
	inerted: Set<Element>;
	/** Modal dialogs the page opened over the surface while it blocks. */
	layered: Set<Element>;
	observer: MutationObserver | null;
}

const blocks = new WeakMap<Document, DocumentBlocks>();

const MODAL_SELECTOR = '[aria-modal="true"], dialog[open]';

/** Whether `element` is, or holds, a modal dialog. */
const holdsModal = (element: Element): boolean =>
	element.matches(MODAL_SELECTOR) ||
	element.querySelector(MODAL_SELECTOR) !== null;

/**
 * The elements to make inert for `surface`: every sibling of every node on
 * its path up to `<body>`, crossing shadow roots, so a surface rendered
 * inside the script-tag build's shadow root still blocks the page around
 * its host.
 */
const outsideOf = function outsideOf(surface: HTMLElement): {
	outside: Element[];
	parents: Node[];
} {
	const outside: Element[] = [];
	const parents: Node[] = [];
	const { body } = surface.ownerDocument;
	let node: Element | null = surface;
	while (
		node &&
		node !== body &&
		node !== surface.ownerDocument.documentElement
	) {
		const parent: Node | null = node.parentNode;
		if (!parent) {
			break;
		}
		parents.push(parent);
		for (const sibling of parent.childNodes) {
			if (sibling !== node && sibling instanceof Element) {
				outside.push(sibling);
			}
		}
		node = composedParent(node);
	}
	return { outside, parents };
};

const apply = function apply(doc: Document, state: DocumentBlocks): void {
	const top = state.surfaces[state.surfaces.length - 1];
	const next = top ? outsideOf(top) : { outside: [], parents: [] };
	for (const element of state.layered) {
		if (!element.isConnected) {
			state.layered.delete(element);
		}
	}
	const wanted = new Set(
		next.outside.filter(
			(element) =>
				!state.layered.has(element) &&
				(state.inerted.has(element) || !element.hasAttribute('inert'))
		)
	);
	for (const element of state.inerted) {
		if (!wanted.has(element)) {
			element.removeAttribute('inert');
			state.inerted.delete(element);
		}
	}
	for (const element of wanted) {
		if (!state.inerted.has(element)) {
			element.setAttribute('inert', '');
			state.inerted.add(element);
		}
	}
	state.observer?.disconnect();
	state.observer = null;
	if (top && typeof MutationObserver !== 'undefined') {
		// A node the page adds beside the surface while it blocks is outside
		// it too, unless it opens a modal dialog over the surface: that is
		// the top layer now, and must take focus and keys.
		const observer = new MutationObserver((records) => {
			for (const record of records) {
				for (const added of record.addedNodes) {
					if (added instanceof Element && holdsModal(added)) {
						state.layered.add(added);
					}
				}
			}
			apply(doc, state);
		});
		for (const parent of next.parents) {
			observer.observe(parent, { childList: true });
		}
		state.observer = observer;
	}
};

/**
 * Make everything outside `surface` inert and lock document scrolling.
 *
 * Blocks stack per document and the newest decides, so a dialog opened
 * while a blocking banner is still leaving is not made inert by it. Scroll
 * locking is reference counted with every other Inth scroll lock.
 *
 * @param surface - The modal surface, possibly inside a shadow root.
 * @returns Releases the page. Idempotent.
 */
export const attachPageBlock = function attachPageBlock(
	surface: HTMLElement,
	options: PageBlockOptions = {}
): () => void {
	const doc = surface.ownerDocument;
	let state = blocks.get(doc);
	if (!state) {
		state = {
			inerted: new Set(),
			layered: new Set(),
			observer: null,
			surfaces: [],
		};
		blocks.set(doc, state);
	}
	const current = state;
	current.surfaces.push(surface);
	apply(doc, current);
	const unlockScroll =
		options.scrollLock === false ? undefined : setupScrollLock();
	let released = false;
	return () => {
		if (released) {
			return;
		}
		released = true;
		const index = current.surfaces.lastIndexOf(surface);
		if (index !== -1) {
			current.surfaces.splice(index, 1);
		}
		apply(doc, current);
		if (current.surfaces.length === 0) {
			blocks.delete(doc);
		}
		unlockScroll?.();
	};
};
