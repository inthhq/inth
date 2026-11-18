/**
 * When `ConsentRoot` loads the consent engine for a visitor who still has
 * to choose. On a slow connection the engine's chunks share bandwidth with
 * the page's largest image; started after it, they no longer delay Largest
 * Contentful Paint (`afterPriorityImages` in
 * `@inth/sdk/runtime/page-globals`).
 *
 * @packageDocumentation
 * @internal
 */

import {
	afterPriorityImages,
	EARLY_TAP_ROOT,
	ENGINE_TIMEOUT_MS,
} from '@inth/sdk/runtime/page-globals';

/** The stock dialog's root. @internal */
export const DIALOG_ROOT = '[data-testid="consent-dialog-root"]';

/**
 * Input anywhere on the page that wakes the engine at once. The browser
 * stops looking for a larger contentful paint at the first input or
 * scroll, so loading then costs Largest Contentful Paint nothing.
 */
const PAGE_WAKE_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

/** Stock surfaces where focus alone wakes the engine. */
const SURFACES = `${EARLY_TAP_ROOT},[data-testid="consent-banner-overlay"]`;

/**
 * Calls `start` once, when the first of these happens: every
 * `img[fetchpriority=high]` that is still loading has loaded or failed (the
 * window `load` event when there is none), the visitor presses a pointer
 * or key or scrolls anywhere on the page outside the stock banner,
 * focuses a stock consent surface, or `ENGINE_TIMEOUT_MS` passed.
 *
 * Input inside the stock banner does not load the engine: a tap there is
 * recorded without it (see `runtime.ts`), and the engine loads after.
 *
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
		Boolean((event.target as Element | null)?.closest?.(EARLY_TAP_ROOT));
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
	cleanups.push(afterPriorityImages(fire, { timeoutMs: ENGINE_TIMEOUT_MS }));
	return stop;
};

/**
 * Calls `done` once the browser is idle, or after `timeout` at most.
 * Without `requestIdleCallback` (Safari) it calls `done` on the next task.
 *
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
