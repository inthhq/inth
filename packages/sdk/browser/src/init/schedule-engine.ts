/**
 * When the init script loads the engine (`inth.hosted.js`).
 *
 * On a slow connection the engine shares bandwidth with the page's largest
 * image; started after it, it no longer delays Largest Contentful Paint
 * (`afterPriorityImages` in `@inth/sdk/runtime/page-globals`).
 *
 * @packageDocumentation
 * @internal
 */

import {
	afterPriorityImages,
	ENGINE_TIMEOUT_MS,
} from '@inth/sdk-core/runtime/page-globals';

/**
 * Input anywhere on the page that loads the engine at once. The browser
 * stops looking for a larger contentful paint at the first input or
 * scroll, so loading then costs Largest Contentful Paint nothing.
 */
const WAKE_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

/**
 * Calls `load` once, at the first of: every `img[fetchpriority=high]` has
 * loaded or failed (the window `load` event when there is none), the
 * visitor presses a pointer or key or scrolls, or {@link ENGINE_TIMEOUT_MS}
 * passed. A page already scrolled loads at once.
 *
 * @returns Cancels the schedule.
 */
export const scheduleEngine = function scheduleEngine(
	load: () => void
): () => void {
	const cleanups: (() => void)[] = [];
	let done = false;
	const cancel = (): void => {
		done = true;
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
	};
	const fire = (): void => {
		if (!done) {
			cancel();
			load();
		}
	};
	if (window.scrollY > 0) {
		fire();
		return cancel;
	}
	for (const type of WAKE_EVENTS) {
		// Capture on window: scroll does not bubble.
		window.addEventListener(type, fire, true);
		cleanups.push(() => window.removeEventListener(type, fire, true));
	}
	cleanups.push(afterPriorityImages(fire, { timeoutMs: ENGINE_TIMEOUT_MS }));
	return cancel;
};
