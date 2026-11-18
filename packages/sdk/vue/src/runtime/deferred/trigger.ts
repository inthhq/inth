/**
 * When the Nuxt plugin's deferred context loads the consent engine for a
 * visitor who still has to choose. On a slow connection the engine's
 * chunks share bandwidth with the page's largest image; started after it,
 * they no longer delay Largest Contentful Paint. The same rule as the
 * server script start (`AFTER_PRIORITY_IMAGES` in
 * `@inth/sdk/runtime/script-server-start`) and `@inth/react`'s deferred
 * root.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * `EARLY_TAPS_WINDOW_KEY`, `EARLY_TAP_ROOT`, `EARLY_TAP_STYLE_ID` and
 * `EARLY_TAP_NOTIFY_KEY` from `@inth/sdk/surface-actions/early-tap-script`,
 * copied: that module also holds the inline script's text, which the
 * first-load chunk does without. A test keeps them equal.
 *
 * @internal
 */
export const EARLY_TAPS_KEY = '__c15tEarlyTaps';
/** @internal */
export const BANNER_ROOT = '[data-testid="consent-banner-root"]';
/** @internal */
export const EARLY_TAP_STYLE_ID = 'c15t-early-tap';
/** @internal */
export const EARLY_TAP_NOTIFY = 'n';

/** One tap the early-tap script recorded. @internal */
export interface EarlyTap {
	action: string;
	at: number;
	model?: string | null;
	prompt?: string | null;
}

/** The queue the early-tap script leaves on `window`. @internal */
export interface EarlyTapQueue {
	taps?: EarlyTap[];
	stop?: () => void;
	n?: () => void;
}

/**
 * The early-tap queue, when the banner's inline script ran.
 *
 * @returns The queue, or `undefined`.
 * @internal
 */
export const earlyTapQueue = function earlyTapQueue():
	| EarlyTapQueue
	| undefined {
	return (window as unknown as Record<string, EarlyTapQueue | undefined>)[
		EARLY_TAPS_KEY
	];
};

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
 * A tap on the stock banner is the caller's to route: `onTap` runs for a
 * tap the banner's inline script recorded, before or after hydration, and
 * input inside the banner does not load the engine.
 *
 * @param start - Loads the engine.
 * @param onTap - Routes a recorded banner tap.
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
		if (queue?.[EARLY_TAP_NOTIFY] === onTap) {
			Reflect.deleteProperty(queue, EARLY_TAP_NOTIFY);
		}
	};
	if (queue?.taps) {
		queue[EARLY_TAP_NOTIFY] = onTap;
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
		Boolean((event.target as Element | null)?.closest?.(BANNER_ROOT));
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

	const waiting = whenPriorityImagesLoad(fire);
	if (waiting) {
		cleanups.push(waiting);
		const timer = setTimeout(fire, DEFERRED_ENGINE_TIMEOUT_MS);
		cleanups.push(() => clearTimeout(timer));
	}
	return stop;
};
