/**
 * When the init script loads the engine (`c15t.hosted.js`).
 *
 * On a slow connection the engine shares bandwidth with the page's largest
 * image; started after it, it no longer delays Largest Contentful Paint.
 * The same rule as the React adapter's deferred engine and the server
 * script start (`AFTER_PRIORITY_IMAGES` in
 * `@inth/sdk/runtime/script-server-start`).
 *
 * @packageDocumentation
 * @internal
 */

/** Load the engine anyway after this long. */
export const ENGINE_TIMEOUT_MS = 10_000;

/**
 * Input anywhere on the page that loads the engine at once. The browser
 * stops looking for a larger contentful paint at the first input or
 * scroll, so loading then costs Largest Contentful Paint nothing.
 */
const WAKE_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

/**
 * Calls `done` once every `img[fetchpriority=high]` still loading has
 * loaded or failed, or at the window `load` event when the page has none.
 * Waits for the document to be parsed first, so a tag in `<head>` sees the
 * page's images.
 *
 * @param done - Runs once.
 * @returns Removes the listeners.
 */
const whenPriorityImagesLoad = function whenPriorityImagesLoad(
	done: () => void
): () => void {
	const cleanups: (() => void)[] = [];
	const listen = (target: EventTarget, type: string, handler: () => void) => {
		target.addEventListener(type, handler);
		cleanups.push(() => target.removeEventListener(type, handler));
	};
	const check = (): void => {
		const images = [
			...document.querySelectorAll<HTMLImageElement>('img[fetchpriority=high]'),
		];
		const loading = images.filter((image) => !image.complete);
		if (loading.length) {
			let left = loading.length;
			const settle = (): void => {
				left -= 1;
				if (!left) {
					done();
				}
			};
			for (const image of loading) {
				listen(image, 'load', settle);
				listen(image, 'error', settle);
			}
		} else if (images.length || document.readyState === 'complete') {
			done();
		} else {
			listen(window, 'load', done);
		}
	};
	if (document.readyState === 'loading') {
		listen(document, 'DOMContentLoaded', check);
	} else {
		check();
	}
	return () => {
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
	};
};

/**
 * Calls `load` once, at the first of: every `img[fetchpriority=high]` has
 * loaded or failed (the window `load` event when there is none), the
 * visitor presses a pointer or key or scrolls, or {@link ENGINE_TIMEOUT_MS}
 * passed. A page already scrolled loads at once.
 *
 * A press `holds` claims does not load the engine: the init script records
 * that accept or reject itself and loads the engine once the choice is
 * stored, so the gated scripts and `c15t.commit.js` get the connection
 * first.
 *
 * @param load - Loads the engine.
 * @param holds - Whether a press is one the init script handles first.
 * @returns Cancels the schedule.
 */
export const scheduleEngine = function scheduleEngine(
	load: () => void,
	holds?: (event: Event) => boolean
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
	const wake = (event: Event): void => {
		if (!holds?.(event)) {
			fire();
		}
	};
	for (const type of WAKE_EVENTS) {
		// Capture on window: scroll does not bubble.
		window.addEventListener(type, wake, true);
		cleanups.push(() => window.removeEventListener(type, wake, true));
	}
	cleanups.push(whenPriorityImagesLoad(fire));
	const timer = setTimeout(fire, ENGINE_TIMEOUT_MS);
	cleanups.push(() => clearTimeout(timer));
	return cancel;
};
