/**
 * When the Nuxt plugin's deferred context loads the consent engine for a
 * visitor who still has to choose. On a slow connection the engine's
 * chunks share bandwidth with the page's largest image; started after it,
 * they no longer delay Largest Contentful Paint (`afterPriorityImages` in
 * `@inth/sdk/runtime/page-globals`).
 *
 * @packageDocumentation
 * @internal
 */

import {
	afterPriorityImages,
	EARLY_TAP_NOTIFY_KEY,
	EARLY_TAP_ROOT,
	earlyTapQueue,
	ENGINE_TIMEOUT_MS,
} from '@inth/sdk/runtime/page-globals';

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
 * A tap on the stock banner is the caller's to route: `onTap` runs for a
 * tap the banner's inline script recorded, before or after hydration, and
 * input inside the banner does not load the engine.
 *
 * @returns Removes the listeners and stops routing taps to `onTap`.
 * @internal
 */
export const scheduleDeferredEngine = function scheduleDeferredEngine(
	start: () => void,
	onTap: () => void
): () => void {
	const cleanups: (() => void)[] = [];
	let done = false;
	const fire = (): void => {
		if (done) {
			return;
		}
		done = true;
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
		start();
	};
	const listen = (
		target: EventTarget,
		type: string,
		handler: (event: Event) => void,
		capture = false
	): void => {
		target.addEventListener(type, handler, capture);
		cleanups.push(() => target.removeEventListener(type, handler, capture));
	};

	// The banner's taps keep reaching `onTap` after the engine was asked
	// for, until the caller stops this: the engine takes a while to load.
	const queue = earlyTapQueue();
	const stopRouting = (): void => {
		if (queue?.[EARLY_TAP_NOTIFY_KEY] === onTap) {
			Reflect.deleteProperty(queue, EARLY_TAP_NOTIFY_KEY);
		}
	};
	if (queue?.taps) {
		queue[EARLY_TAP_NOTIFY_KEY] = onTap;
	}
	// A tap queued before this ran.
	if (queue?.taps?.length) {
		onTap();
	}
	const stop = (): void => {
		done = true;
		stopRouting();
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
	};
	// A scroll already ended the browser's search for a larger paint.
	if (window.scrollY > 0) {
		fire();
		return stop;
	}
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
		listen(window, type, wake, true);
	}
	listen(
		document,
		'focusin',
		(event) => {
			const target = event.target as Element | null;
			if (target?.closest?.(SURFACES) && !inBanner(event)) {
				fire();
			}
		},
		true
	);

	cleanups.push(afterPriorityImages(fire, { timeoutMs: ENGINE_TIMEOUT_MS }));
	return stop;
};
