/**
 * Scroll-edge fades for consent scroll areas (LAY-08).
 *
 * The fade is a `mask-image` driven by `--fade-top` and `--fade-bottom`;
 * the stylesheet sets their lengths (20px and 28px) when the area carries
 * `data-fade-top` or `data-fade-bottom`, and animates them over 150ms. This
 * controller only says which edges have more content beyond them, so the
 * lengths stay themeable in CSS.
 *
 * @packageDocumentation
 */

/** Stops watching; `update()` recomputes now. */
export interface ScrollFades {
	(): void;
	update: () => void;
}

/** Pixels of slack, so sub-pixel layouts don't show a sliver of fade. */
const SLACK = 1;

/** Which edges of `area` have more content beyond them. */
export const readScrollFades = function readScrollFades(
	area: Pick<HTMLElement, 'clientHeight' | 'scrollHeight' | 'scrollTop'>
): { top: boolean; bottom: boolean } {
	return {
		bottom: area.scrollTop + area.clientHeight < area.scrollHeight - SLACK,
		top: area.scrollTop > SLACK,
	};
};

/**
 * Keep `data-fade-top` and `data-fade-bottom` on `area` in step with its
 * scroll position: on scroll, on resize of the area or its content, on
 * content changes, and after a disclosure's `grid-template-rows`
 * transition ends (otherwise expanding a panel leaves a stale fade).
 */
export const attachScrollFades = function attachScrollFades(
	area: HTMLElement
): ScrollFades {
	const update = () => {
		const { bottom, top } = readScrollFades(area);
		area.toggleAttribute('data-fade-top', top);
		area.toggleAttribute('data-fade-bottom', bottom);
	};
	const onTransitionEnd = (event: TransitionEvent) => {
		if (event.propertyName === 'grid-template-rows') {
			update();
		}
	};
	area.addEventListener('scroll', update, { passive: true });
	area.addEventListener('transitionend', onTransitionEnd);
	const view = area.ownerDocument.defaultView;
	view?.addEventListener('resize', update);

	let resize: ResizeObserver | null = null;
	const observeContent = () => {
		if (!resize) {
			return;
		}
		resize.disconnect();
		resize.observe(area);
		for (const child of area.children) {
			resize.observe(child);
		}
	};
	if (typeof ResizeObserver !== 'undefined') {
		resize = new ResizeObserver(update);
	}
	observeContent();
	// Under reduced motion a disclosure has no transition to end, so watch
	// the content itself too.
	const mutations =
		typeof MutationObserver === 'undefined'
			? null
			: new MutationObserver(() => {
					observeContent();
					update();
				});
	mutations?.observe(area, { childList: true, subtree: true });
	update();

	const stop = (() => {
		area.removeEventListener('scroll', update);
		area.removeEventListener('transitionend', onTransitionEnd);
		view?.removeEventListener('resize', update);
		resize?.disconnect();
		mutations?.disconnect();
		area.removeAttribute('data-fade-top');
		area.removeAttribute('data-fade-bottom');
	}) as ScrollFades;
	stop.update = update;
	return stop;
};
