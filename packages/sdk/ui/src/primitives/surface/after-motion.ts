/**
 * Finish a motion step whether or not anything animates (MOT-03, PERM-14).
 *
 * Under reduced motion nothing animates, so an `animationend` or
 * `transitionend` never fires; a 1ms animation ending at `opacity: 0` once
 * made the "Saved" cue invisible instead. These helpers end the step with
 * a timer then, and with the motion's own end event otherwise.
 *
 * @packageDocumentation
 */

import { prefersReducedMotion } from '../../utils/reduced-motion';

/** Options for {@link afterMotion}. */
export interface AfterMotionOptions {
	/** How long the step lasts. Under reduced motion this is the timer. */
	duration: number;
	/** The event that ends it. Defaults to `'animationend'`. */
	event?: 'animationend' | 'transitionend';
	/** Only this transitioned property counts, for `'transitionend'`. */
	property?: string;
	/** Defaults to the visitor's `prefers-reduced-motion`. */
	reducedMotion?: boolean;
	/**
	 * Extra time before the timer ends a step whose event never fired, such
	 * as an animation a stylesheet removed. Defaults to 100ms.
	 */
	slack?: number;
}

/**
 * Call `done` once when `element`'s motion ends: on its own end event, or
 * on a timer under reduced motion or when the event never comes.
 *
 * @example
 * ```ts
 * // The "Saved" cue stays 1.7s, then goes.
 * const cancel = afterMotion(cue, () => hideCue(), { duration: 1700 });
 * ```
 * @returns Cancels without calling `done`. Clear it on close and reset
 * (ARCH-02).
 */
export const afterMotion = function afterMotion(
	element: Element,
	done: () => void,
	options: AfterMotionOptions
): () => void {
	const reduced = options.reducedMotion ?? prefersReducedMotion();
	const eventName = options.event ?? 'animationend';
	let finished = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	// Declared before `finish` and `onEnd`, which both call it.
	let onEnd: (event: Event) => void = () => undefined;
	const cancel = () => {
		clearTimeout(timer);
		element.removeEventListener(eventName, onEnd);
	};
	const finish = () => {
		if (finished) {
			return;
		}
		finished = true;
		cancel();
		done();
	};
	onEnd = (event: Event) => {
		if (event.target !== element) {
			return;
		}
		if (
			options.property !== undefined &&
			(event as TransitionEvent).propertyName !== options.property
		) {
			return;
		}
		finish();
	};
	if (reduced) {
		timer = setTimeout(finish, options.duration);
	} else {
		element.addEventListener(eventName, onEnd);
		timer = setTimeout(finish, options.duration + (options.slack ?? 100));
	}
	return () => {
		finished = true;
		cancel();
	};
};
