/**
 * When the first-load shell loads the consent engine for a visitor who
 * still has to choose. On a slow connection the engine's chunks share
 * bandwidth with the page's largest image; started after it, they no
 * longer delay Largest Contentful Paint. The same rule as the React and
 * Nuxt deferred roots (`@inth/react/deferred`, `@inth/vue`'s
 * `runtime/deferred/trigger.ts`).
 *
 * @internal
 */

/**
 * `EARLY_TAPS_WINDOW_KEY`, `EARLY_TAP_ROOT` and `EARLY_TAP_STYLE_ID` from
 * `@inth/sdk/surface-actions/early-tap-script`, copied: that module also
 * holds the inline script's text, which the first-load chunk does without.
 * A test keeps them equal.
 *
 * @internal
 */
export const EARLY_TAPS_KEY = '__inthEarlyTaps';
/** @internal */
export const BANNER_ROOT = '[data-testid="consent-banner-root"]';
/** @internal */
export const EARLY_TAP_STYLE_ID = 'inth-early-tap';

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
}

/**
 * Stops the banner's early-tap script and hands back what it recorded.
 * From here the delegated listener sees the banner's clicks.
 *
 * @returns The taps, oldest first; empty without the script.
 * @internal
 */
export const takeEarlyTaps = function takeEarlyTaps(): EarlyTap[] {
	const queue = (
		window as unknown as Record<string, EarlyTapQueue | undefined>
	)[EARLY_TAPS_KEY];
	queue?.stop?.();
	return queue?.taps?.splice(0) ?? [];
};

/** Show the banner again after the early-tap script hid it. @internal */
export const unhideEarlyTap = function unhideEarlyTap(): void {
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
};

/** Load anyway after this long. @internal */
export const DEFERRED_ENGINE_TIMEOUT_MS = 10_000;

/**
 * Input anywhere on the page that wakes the engine at once. The browser
 * stops looking for a larger contentful paint at the first input or
 * scroll, so loading then costs Largest Contentful Paint nothing.
 */
const PAGE_WAKE_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

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
 * or key or scrolls anywhere on the page outside the banner, focuses the
 * banner's overlay, or {@link DEFERRED_ENGINE_TIMEOUT_MS} passed.
 *
 * Input inside the banner is the shell's to route: it does not load the
 * engine, and a pointer going down on one of the banner's action buttons
 * calls `onPress` with the button's `data-inth-action`, ahead of its click.
 *
 * @param start - Loads the engine.
 * @param onPress - Sees presses on the banner's buttons.
 * @returns Removes the listeners.
 * @internal
 */
export const scheduleDeferredEngine = function scheduleDeferredEngine(
	start: () => void,
	onPress: (action: string) => void
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
	const listen = (
		target: EventTarget,
		type: string,
		handler: (event: Event) => void,
		capture = false
	): void => {
		target.addEventListener(type, handler, capture);
		cleanups.push(() => target.removeEventListener(type, handler, capture));
	};

	// A scroll already ended the browser's search for a larger paint.
	if (window.scrollY > 0) {
		fire();
		return stop;
	}
	const wake = (event: Event): void => {
		const target = event.target as Element | null;
		if (!target?.closest?.(BANNER_ROOT)) {
			fire();
			return;
		}
		if (event.type === 'pointerdown') {
			const action = target
				.closest('[data-inth-action]')
				?.getAttribute('data-inth-action');
			if (action) {
				onPress(action);
			}
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
			if (target?.closest?.('[data-testid="consent-banner-overlay"]')) {
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
