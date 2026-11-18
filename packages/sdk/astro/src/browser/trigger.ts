/**
 * When the first-load shell loads the consent engine for a visitor who
 * still has to choose. On a slow connection the engine's chunks share
 * bandwidth with the page's largest image; started after it, they no
 * longer delay Largest Contentful Paint (`afterPriorityImages` in
 * `@inth/sdk/runtime/priority-images`).
 *
 * @internal
 */

import {
	EARLY_TAP_ROOT,
	EARLY_TAP_STYLE_ID,
	earlyTapQueue,
} from '@inth/sdk/runtime/page-globals';
import type { EarlyConsentTap } from '@inth/sdk/runtime/page-globals';
import {
	afterPriorityImages,
	ENGINE_TIMEOUT_MS,
} from '@inth/sdk/runtime/priority-images';

/**
 * Stops the banner's early-tap script and hands back what it recorded.
 * From here the delegated listener sees the banner's clicks.
 *
 * @returns The taps, oldest first; empty without the script.
 * @internal
 */
export const takeEarlyTaps = function takeEarlyTaps(): EarlyConsentTap[] {
	const queue = earlyTapQueue();
	queue?.stop?.();
	return queue?.taps?.splice(0) ?? [];
};

/** Show the banner again after the early-tap script hid it. @internal */
export const unhideEarlyTap = function unhideEarlyTap(): void {
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
};

/**
 * Input anywhere on the page that wakes the engine at once. The browser
 * stops looking for a larger contentful paint at the first input or
 * scroll, so loading then costs Largest Contentful Paint nothing.
 */
const PAGE_WAKE_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

/**
 * Calls `start` once, when the first of these happens: every
 * `img[fetchpriority=high]` that is still loading has loaded or failed (the
 * window `load` event when there is none), the visitor presses a pointer
 * or key or scrolls anywhere on the page outside the banner, focuses the
 * banner's overlay, or `ENGINE_TIMEOUT_MS` passed.
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
		if (!target?.closest?.(EARLY_TAP_ROOT)) {
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

	cleanups.push(afterPriorityImages(fire, { timeoutMs: ENGINE_TIMEOUT_MS }));
	return stop;
};
