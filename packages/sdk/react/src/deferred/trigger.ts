/**
 * When a deferred root loads the consent engine for a visitor who still
 * has to choose. On a slow connection the engine's chunks share bandwidth
 * with the page's largest image; started after it, they no longer delay
 * Largest Contentful Paint (`afterPriorityImages` in
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
	SERVER_START_FAILED_EVENT,
} from '@inth/sdk/runtime/page-globals';

import { pageRender } from './boot';
import type * as DialogModule from './dialog';

/**
 * Imports the stock dialog's chunk group (`./dialog`). The deferred root's
 * early dialog and the aggregate `ConsentDialog`'s warmers both load the
 * dialog through this one `import()`: a bundler that builds a chunk group
 * per call site, as Turbopack does, would otherwise give each its own copy
 * of the panel, and a hover on Customize followed by the tap downloaded
 * both. It lives in this module, which both already import, so it adds no
 * file to the first load.
 *
 * @returns The dialog wrapper and its panel and preferences modules.
 * @internal
 */
export const importDialog = (): Promise<typeof DialogModule> =>
	import('./dialog');

/**
 * Input anywhere on the page that wakes the engine at once. The browser
 * stops looking for a larger contentful paint at the first input or
 * scroll, so loading then costs Largest Contentful Paint nothing, and the
 * engine is closer to ready when the visitor reaches the banner.
 */
const PAGE_WAKE_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

/** Stock surfaces where focus alone wakes the engine. */
const SURFACES = `${EARLY_TAP_ROOT},[data-testid="consent-banner-overlay"]`;

/**
 * Calls `start` once, when the first of these happens: every
 * `img[fetchpriority=high]` that is still loading has loaded or failed (the
 * window `load` event when there is none), the visitor presses a pointer
 * or key or scrolls anywhere on the page, focuses a stock consent surface,
 * already tapped one before hydration, or
 * `ENGINE_TIMEOUT_MS` passed.
 *
 * With `onTap`, `onTap` runs for a tap the banner's inline script
 * recorded, before or after hydration. Input on the banner wakes the
 * engine like any other, and the engine's banner replays the tap through
 * its own handlers. Routing lasts until the returned cleanup runs, not
 * only until `start`.
 *
 * @param start - Loads the engine.
 * @param onTap - Routes a recorded banner tap.
 * @param renderId - The render whose failed server start loads the engine
 * at once. Defaults to the one the document's boot data names.
 * @returns Removes the listeners.
 * @internal
 */
export const scheduleDeferredEngine = function scheduleDeferredEngine(
	start: () => void,
	onTap?: () => void,
	renderId?: string
): () => void {
	/** Wake-ups, removed once `start` ran. */
	const cleanups: (() => void)[] = [];
	/** Tap routing, removed by the returned cleanup. */
	const routes: (() => void)[] = [];
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
	const dispose = (): void => {
		done = true;
		for (const cleanup of [...cleanups.splice(0), ...routes.splice(0)]) {
			cleanup();
		}
	};
	const listen = (
		target: EventTarget,
		type: string,
		handler: (event: Event) => void,
		capture = false,
		into = cleanups
	): void => {
		target.addEventListener(type, handler, capture);
		into.push(() => target.removeEventListener(type, handler, capture));
	};

	const queue = earlyTapQueue();
	if (onTap && queue?.taps) {
		queue[EARLY_TAP_NOTIFY_KEY] = () => onTap();
		routes.push(() => {
			Reflect.deleteProperty(queue, EARLY_TAP_NOTIFY_KEY);
		});
	}
	// A tap queued before hydration, or a scroll that already ended the
	// browser's search for a larger paint.
	if (onTap && queue?.taps?.length) {
		onTap();
	}
	// A server start that failed in the browser left its script to the
	// loader, before this ran or while the engine waits.
	listen(window, SERVER_START_FAILED_EVENT, fire);
	if (
		window.scrollY > 0 ||
		pageRender(renderId)?.failed ||
		(!onTap && queue?.taps?.length)
	) {
		fire();
		return dispose;
	}
	for (const type of PAGE_WAKE_EVENTS) {
		// Capture on window: scroll does not bubble, and an element that
		// scrolls dispatches it there on the way down.
		listen(window, type, fire, true);
	}
	listen(
		document,
		'focusin',
		(event) => {
			const target = event.target as Element | null;
			if (target?.closest?.(SURFACES)) {
				fire();
			}
		},
		true
	);

	cleanups.push(afterPriorityImages(fire, { timeoutMs: ENGINE_TIMEOUT_MS }));
	return dispose;
};
