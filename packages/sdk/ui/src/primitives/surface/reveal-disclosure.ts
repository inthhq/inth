/**
 * Bring an opened region into view by scrolling the surface's scroll body
 * only (LAY-05, RIGHT-07).
 *
 * `Element.scrollIntoView` also scrolls the card, whose `overflow: hidden`
 * then pushes the header out of view, so these never call it.
 *
 * @packageDocumentation
 */

import { prefersReducedMotion } from '../../utils/reduced-motion';
import { disclosureRevealDelta, revealDelta } from './scroll-reveal.model';

/** Options for the reveal functions. */
export interface ScrollRevealOptions {
	/** The scroll body. Defaults to the nearest scrolling ancestor. */
	body?: HTMLElement | null;
	/** Defaults to the visitor's `prefers-reduced-motion`. */
	reducedMotion?: boolean;
	margin?: number;
}

const scrolls = (element: Element): boolean => {
	const { overflowY } = getComputedStyle(element);
	return overflowY === 'auto' || overflowY === 'scroll';
};

/** The nearest ancestor of `element` that scrolls vertically, in its own tree. */
export const findScrollBody = function findScrollBody(
	element: Element
): HTMLElement | null {
	for (let node = element.parentElement; node; node = node.parentElement) {
		if (scrolls(node)) {
			return node;
		}
	}
	return null;
};

const scrollBody = function scrollBody(
	body: HTMLElement,
	top: number,
	reducedMotion: boolean
): void {
	if (top === 0) {
		return;
	}
	if (typeof body.scrollBy === 'function') {
		body.scrollBy({ behavior: reducedMotion ? 'auto' : 'smooth', top });
	} else {
		body.scrollTop += top;
	}
};

/**
 * Scroll `target` into view inside its scroll body, such as an opened
 * confirmation.
 *
 * @returns The distance scrolled.
 */
export const revealInScrollBody = function revealInScrollBody(
	target: Element,
	options: ScrollRevealOptions & { mode?: 'nearest' | 'start' } = {}
): number {
	const body = options.body ?? findScrollBody(target);
	if (!body) {
		return 0;
	}
	const delta = revealDelta(
		body.getBoundingClientRect(),
		target.getBoundingClientRect(),
		options.mode,
		options.margin
	);
	scrollBody(body, delta, options.reducedMotion ?? prefersReducedMotion());
	return delta;
};

/**
 * Reveal an opened disclosure: as much of `panel` as fits, keeping
 * `trigger` in view.
 *
 * @returns The distance scrolled.
 */
export const revealDisclosure = function revealDisclosure(
	trigger: Element,
	panel: Element,
	options: ScrollRevealOptions = {}
): number {
	const body = options.body ?? findScrollBody(trigger);
	if (!body) {
		return 0;
	}
	const delta = disclosureRevealDelta(
		body.getBoundingClientRect(),
		trigger.getBoundingClientRect(),
		panel.getBoundingClientRect(),
		options.margin
	);
	scrollBody(body, delta, options.reducedMotion ?? prefersReducedMotion());
	return delta;
};

/**
 * Run a reveal after a disclosure has started to open (230ms by default),
 * unless the surface changed meanwhile (PERM-16). Pass the surface
 * session's `isCurrent` bound to the token captured now.
 *
 * @returns Cancels the reveal.
 */
export const scheduleReveal = function scheduleReveal(
	reveal: () => void,
	options: { delay?: number; isCurrent?: () => boolean } = {}
): () => void {
	const timer = setTimeout(() => {
		if (options.isCurrent?.() ?? true) {
			reveal();
		}
	}, options.delay ?? 230);
	return () => {
		clearTimeout(timer);
	};
};
