/**
 * Keep a tap on the dimmed parent from also clicking what is under it
 * (NEST-05).
 *
 * On touch, `pointerdown` on the backdrop pops the top sheet and lifts the
 * parent's `inert`, so the same tap's `click` landed on the parent's ×
 * (closing the whole dialog and discarding EU edits) or on a switch. The
 * guard swallows clicks for a short window after a backdrop
 * `pointerdown`.
 *
 * @packageDocumentation
 */

/** How long clicks are swallowed after a backdrop press. */
export const BACKDROP_CLICK_GUARD_MS = 450;

/** Options for {@link attachBackdropGuard}. */
export interface BackdropGuardOptions {
	/** Whether a `pointerdown` on `target` is a press on the backdrop or dimmed parent. */
	isBackdrop: (target: Element) => boolean;
	/** Close the top layer. Called on the backdrop `pointerdown`. */
	onBackdrop: (event: PointerEvent) => void;
	/** Defaults to {@link BACKDROP_CLICK_GUARD_MS}. */
	windowMs?: number;
}

/**
 * Close the top layer on a backdrop press, and swallow the clicks that
 * follow it inside `root`.
 *
 * @param root - The element holding the stacked layers.
 * @returns Stops guarding.
 */
export const attachBackdropGuard = function attachBackdropGuard(
	root: HTMLElement,
	options: BackdropGuardOptions
): () => void {
	const windowMs = options.windowMs ?? BACKDROP_CLICK_GUARD_MS;
	let swallowUntil = 0;
	const onPointerDown = (event: PointerEvent) => {
		const target = event.composedPath()[0] ?? event.target;
		if (target instanceof Element && options.isBackdrop(target)) {
			event.preventDefault();
			swallowUntil = Date.now() + windowMs;
			options.onBackdrop(event);
		}
	};
	const onClick = (event: MouseEvent) => {
		if (Date.now() < swallowUntil) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};
	root.addEventListener('pointerdown', onPointerDown, true);
	root.addEventListener('click', onClick, true);
	return () => {
		root.removeEventListener('pointerdown', onPointerDown, true);
		root.removeEventListener('click', onClick, true);
	};
};
