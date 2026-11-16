/**
 * When `ConsentManager` loads the consent engine for a visitor who still
 * has to choose. On a slow connection the engine's chunks share bandwidth with
 * the page's largest image; started after it, they no longer delay Largest
 * Contentful Paint. The same rule as the server script start
 * (`AFTER_PRIORITY_IMAGES` in `@c15t/core/runtime/script-server-start`),
 * `@c15t/react`'s deferred root, `@c15t/svelte`'s `ConsentRoot` and
 * `@c15t/vue`'s Nuxt module.
 *
 * @packageDocumentation
 * @internal
 */

/** The stock banner's root. @internal */
export const BANNER_ROOT = '[data-testid="consent-banner-root"]';

/** The stock dialog's root. @internal */
export const DIALOG_ROOT = '[data-testid="consent-dialog-root"]';

/** Load anyway after this long. @internal */
export const DEFERRED_ENGINE_TIMEOUT_MS = 10_000;

/**
 * Input anywhere on the page that wakes the engine at once. The browser
 * stops looking for a larger contentful paint at the first input or
 * scroll, so loading then costs Largest Contentful Paint nothing.
 */
const PAGE_WAKE_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

/** Stock surfaces where focus alone wakes the engine. */
const SURFACES = `${BANNER_ROOT},[data-testid="consent-banner-overlay"]`;

/**
 * Calls `done` once every `img[fetchpriority=high]` still loading has
 * loaded or failed, or at the window `load` event when the page has none.
 *
 * @param done - Runs once.
 * @returns Removes the listeners, or `undefined` when `done` already ran.
 * @internal
 */
export const whenPriorityImagesLoad = function whenPriorityImagesLoad(
	done: () => void
): (() => void) | undefined {
	const images = [
		...document.querySelectorAll<HTMLImageElement>('img[fetchpriority=high]'),
	].filter((image) => !image.complete);
	const cleanups: (() => void)[] = [];
	const listen = (target: EventTarget, type: string, handler: () => void) => {
		target.addEventListener(type, handler);
		cleanups.push(() => target.removeEventListener(type, handler));
	};
	let called = false;
	const finish = (): void => {
		if (!called) {
			called = true;
			for (const cleanup of cleanups.splice(0)) {
				cleanup();
			}
			done();
		}
	};
	if (images.length > 0) {
		let left = images.length;
		const settle = (): void => {
			left -= 1;
			if (left === 0) {
				finish();
			}
		};
		for (const image of images) {
			listen(image, 'load', settle);
			listen(image, 'error', settle);
		}
	} else if (
		document.querySelector('img[fetchpriority=high]') ||
		document.readyState === 'complete'
	) {
		done();
		return undefined;
	} else {
		listen(window, 'load', finish);
	}
	return () => {
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
	};
};

/**
 * Calls `start` once, when the first of these happens: every
 * `img[fetchpriority=high]` that is still loading has loaded or failed (the
 * window `load` event when there is none), the visitor presses a pointer
 * or key or scrolls anywhere on the page outside the stock banner,
 * focuses a stock consent surface, or {@link DEFERRED_ENGINE_TIMEOUT_MS}
 * passed.
 *
 * Input inside the stock banner does not load the engine: a tap there is
 * recorded without it (see `deferred-runtime.ts`), and the engine loads
 * after.
 *
 * @param start - Loads the engine.
 * @returns Removes the listeners.
 * @internal
 */
export const scheduleDeferredEngine = function scheduleDeferredEngine(
	start: () => void
): () => void {
	const cleanups: (() => void)[] = [];
	let done = false;
	const stop = (): void => {
		done = true;
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
	};
	const fire = (): void => {
		if (!done) {
			stop();
			start();
		}
	};
	// A scroll already ended the browser's search for a larger paint.
	if (window.scrollY > 0) {
		fire();
		return stop;
	}
	const listen = (
		target: EventTarget,
		type: string,
		handler: (event: Event) => void
	): void => {
		target.addEventListener(type, handler, true);
		cleanups.push(() => target.removeEventListener(type, handler, true));
	};
	const inBanner = (event: Event): boolean =>
		Boolean((event.target as Element | null)?.closest?.(BANNER_ROOT));
	const wake = (event: Event): void => {
		if (!inBanner(event)) {
			fire();
		}
	};
	for (const type of PAGE_WAKE_EVENTS) {
		// Capture on window: scroll does not bubble, and an element that
		// scrolls dispatches it there on the way down.
		listen(window, type, wake);
	}
	listen(document, 'focusin', (event) => {
		const target = event.target as Element | null;
		if (target?.closest?.(SURFACES) && !inBanner(event)) {
			fire();
		}
	});
	const waiting = whenPriorityImagesLoad(fire);
	if (waiting) {
		cleanups.push(waiting);
		const timer = setTimeout(fire, DEFERRED_ENGINE_TIMEOUT_MS);
		cleanups.push(() => clearTimeout(timer));
	}
	return stop;
};

/**
 * Calls `done` once the browser is idle, or after `timeout` without
 * `requestIdleCallback` (Safari).
 *
 * @param done - Runs once.
 * @param timeout - Longest wait, in milliseconds.
 * @internal
 */
export const whenIdle = function whenIdle(
	done: () => void,
	timeout = 1000
): void {
	const host = window as Window & {
		requestIdleCallback?: (
			callback: () => void,
			options?: { timeout: number }
		) => number;
	};
	if (host.requestIdleCallback) {
		host.requestIdleCallback(done, { timeout });
		return;
	}
	setTimeout(done, 0);
};
