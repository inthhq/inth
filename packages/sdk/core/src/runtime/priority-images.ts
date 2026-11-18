/**
 * When first-load code may start a download without delaying the page's
 * Largest Contentful Paint. On a slow connection anything downloaded
 * before the page's largest image shares bandwidth with it; started after
 * it, it no longer delays that paint. The server script start's inline
 * copy of the rule (`AFTER_PRIORITY_IMAGES` in `./script-server-start`)
 * shares {@link PRIORITY_IMAGE_SELECTOR}.
 *
 * @packageDocumentation
 * @internal
 */

/** The page's priority images. @internal */
export const PRIORITY_IMAGE_SELECTOR = 'img[fetchpriority=high]';

/**
 * How long a deferred root or the init script waits before it loads the
 * consent engine anyway, in milliseconds. @internal
 */
export const ENGINE_TIMEOUT_MS = 10_000;

/**
 * Calls `done` once, when every `img[fetchpriority=high]` still loading
 * has loaded or failed, at the window `load` event when the page has
 * none, or after `timeoutMs`. `done` runs at once when the images are in
 * already. A document still parsing with no priority image yet is checked
 * again once parsed, so a script in `<head>` sees the page's images.
 *
 * @param done - Runs once.
 * @param options - `timeoutMs`: call `done` after this long anyway.
 * @returns Removes the listeners and the timer.
 * @internal
 */
export const afterPriorityImages = function afterPriorityImages(
	done: () => void,
	{ timeoutMs }: { timeoutMs?: number } = {}
): () => void {
	const cleanups: (() => void)[] = [];
	const cleanup = (): void => {
		for (const remove of cleanups.splice(0)) {
			remove();
		}
	};
	let called = false;
	const finish = (): void => {
		if (!called) {
			called = true;
			cleanup();
			done();
		}
	};
	const listen = (target: EventTarget, type: string, handler: () => void) => {
		target.addEventListener(type, handler);
		cleanups.push(() => target.removeEventListener(type, handler));
	};
	const check = (): void => {
		const images = [
			...document.querySelectorAll<HTMLImageElement>(PRIORITY_IMAGE_SELECTOR),
		];
		const loading = images.filter((image) => !image.complete);
		if (loading.length > 0) {
			let left = loading.length;
			const settle = (): void => {
				left -= 1;
				if (left === 0) {
					finish();
				}
			};
			for (const image of loading) {
				listen(image, 'load', settle);
				listen(image, 'error', settle);
			}
		} else if (images.length > 0 || document.readyState === 'complete') {
			finish();
		} else if (document.readyState === 'loading') {
			const parsed = (): void => {
				document.removeEventListener('DOMContentLoaded', parsed);
				check();
			};
			listen(document, 'DOMContentLoaded', parsed);
		} else {
			listen(window, 'load', finish);
		}
	};
	if (timeoutMs !== undefined) {
		const timer = setTimeout(finish, timeoutMs);
		cleanups.push(() => clearTimeout(timer));
	}
	check();
	return cleanup;
};
