/**
 * When a deferred root loads the consent engine for a visitor who still
 * has to choose. On a slow connection the engine's chunks share bandwidth
 * with the page's largest image; started after it, they no longer delay
 * Largest Contentful Paint. The same rule as the server script start
 * (`AFTER_PRIORITY_IMAGES` in `@c15t/core/runtime/script-server-start`).
 *
 * @packageDocumentation
 * @internal
 */

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
 * `EARLY_TAPS_WINDOW_KEY` and `EARLY_TAP_ROOT` from
 * `@c15t/core/surface-actions/early-tap-script`, copied: that module also
 * holds the inline script's text, which the first-load chunk can do
 * without. A test keeps them equal.
 */
export const EARLY_TAPS_KEY = '__c15tEarlyTaps';
export const BANNER_ROOT = '[data-testid="consent-banner-root"]';

/**
 * Property of the early-tap queue the inline script calls after it
 * records a tap (`EARLY_TAP_NOTIFY_KEY` in core, copied for the same
 * reason; a test keeps them equal).
 */
export const EARLY_TAP_NOTIFY = 'n';

/**
 * Property of the early-tap queue that holds presses on the banner's
 * buttons (`EARLY_TAP_HOLD_PRESSES_KEY` in core, copied for the same
 * reason; a test keeps them equal).
 */
export const EARLY_TAP_HOLD_PRESSES = 'b';

/** The queue the early-tap script leaves on `window`. @internal */
export interface EarlyTapQueue {
	taps?: { action: string; at: number }[];
	stop?: () => void;
	n?: () => void;
	b?: number;
}

/** The early-tap queue, when the banner's inline script ran. @internal */
export const earlyTapQueue = function earlyTapQueue():
	| EarlyTapQueue
	| undefined {
	return (window as unknown as Record<string, EarlyTapQueue | undefined>)[
		EARLY_TAPS_KEY
	];
};

/**
 * `SERVER_START_FAILED_EVENT` in core; a test keeps them equal. A failure
 * before the root scheduled its engine is `failed` in the render's page
 * object. @internal
 */
export const SERVER_START_FAILED = '__c15tServerStartFailed';

/** Load anyway after this long. */
export const DEFERRED_ENGINE_TIMEOUT_MS = 10_000;

/**
 * Input anywhere on the page that wakes the engine at once. The browser
 * stops looking for a larger contentful paint at the first input or
 * scroll, so loading then costs Largest Contentful Paint nothing, and the
 * engine is closer to ready when the visitor reaches the banner.
 */
const PAGE_WAKE_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

/** Stock surfaces where focus alone wakes the engine. */
const SURFACES = `${BANNER_ROOT},[data-testid="consent-banner-overlay"]`;

/**
 * Calls `done` once every `img[fetchpriority=high]` still loading has loaded
 * or failed, or at the window `load` event when the page has none. On a
 * slow connection anything downloaded before then shares bandwidth with the
 * page's largest image.
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
	if (images.length) {
		let left = images.length;
		const settle = (): void => {
			left -= 1;
			if (!left) {
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
		// The priority images are in already.
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
 * or key or scrolls anywhere on the page, focuses a stock consent surface,
 * already tapped one before hydration, or
 * {@link DEFERRED_ENGINE_TIMEOUT_MS} passed.
 *
 * With `onTap`, a banner tap is the root's to route: input inside the
 * stock banner no longer loads the engine, and `onTap` runs for a tap the
 * banner's inline script recorded, before or after hydration. The root
 * then records an accept or reject without the engine (`commit.ts`) and
 * loads the engine after. Routing lasts until the returned cleanup runs,
 * not only until `start`: a tap while the engine downloads is still the
 * root's, which hands it to the engine once that renders.
 *
 * A pointer going down on a banner button calls `onTap` with the button's
 * `data-action`, ahead of its click.
 *
 * @param start - Loads the engine.
 * @param onTap - Routes a recorded banner tap, or a press on a button.
 * @param renderId - The render whose failed server start loads the engine
 * at once. Defaults to the one the document's boot data names.
 * @returns Removes the listeners.
 * @internal
 */
export const scheduleDeferredEngine = function scheduleDeferredEngine(
	start: () => void,
	onTap?: (pressed?: string) => void,
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

	/** Input the root routes itself: on the stock banner. */
	const routed = (event: Event): boolean =>
		Boolean(onTap && (event.target as Element | null)?.closest?.(BANNER_ROOT));
	const queue = earlyTapQueue();
	if (onTap) {
		if (queue?.taps) {
			queue[EARLY_TAP_NOTIFY] = () => onTap();
			routes.push(() => {
				Reflect.deleteProperty(queue, EARLY_TAP_NOTIFY);
			});
		}
		listen(
			window,
			'pointerdown',
			(event) => {
				if (!routed(event)) {
					return;
				}
				const action = (event.target as Element)
					.closest('[data-action]')
					?.getAttribute('data-action');
				if (action) {
					onTap(action);
				}
			},
			true,
			routes
		);
	}
	// A tap queued before hydration, or a scroll that already ended the
	// browser's search for a larger paint.
	if (onTap && queue?.taps?.length) {
		onTap();
	}
	// A server start that failed in the browser left its script to the
	// loader, before this ran or while the engine waits.
	listen(window, SERVER_START_FAILED, fire);
	if (
		window.scrollY > 0 ||
		pageRender(renderId)?.failed ||
		(!onTap && queue?.taps?.length)
	) {
		fire();
		return dispose;
	}
	const wake = (event: Event): void => {
		if (!routed(event)) {
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
			if (target?.closest?.(SURFACES) && !routed(event)) {
				fire();
			}
		},
		true
	);

	const waiting = whenPriorityImagesLoad(fire);
	if (!waiting) {
		return dispose;
	}
	cleanups.push(waiting);
	const timer = setTimeout(fire, DEFERRED_ENGINE_TIMEOUT_MS);
	cleanups.push(() => clearTimeout(timer));
	return dispose;
};
