/**
 * Loading the deferred consent dialog before its first open.
 *
 * The consent dialog keeps itself out of the first load and loads on
 * first use, so the first open would otherwise wait for its chunk. The
 * dialog registers a warmer here, and two signals start the import early:
 *
 * - Intent: pointerenter or focus on a `ConsentButton` that opens the
 *   dialog (the banner's Customize button, `ConsentDialogLink`, the
 *   `ConsentGate` placeholder) or on `ConsentDialogTrigger`.
 * - Idle: once the page has loaded and the browser is idle, while one of
 *   those openers is mounted. This covers an immediate tap or
 *   focus-and-Enter, which leaves no lead time for intent.
 *
 * A module-level registry keeps the openers decoupled from the dialog, so
 * an app that never renders `ConsentDialog` loads nothing.
 */

type Warmer = () => void;

/**
 * When the deferred consent dialog starts loading before it opens.
 *
 * - `'idle'`: after the page's load event, in browser idle time, while a
 *   button that opens the dialog is mounted. Also on hover or focus of
 *   such a button.
 * - `'intent'`: only on hover or focus of a button that opens the dialog.
 */
export type DialogPreload = 'idle' | 'intent';

interface NetworkInformationLike {
	effectiveType?: string;
	saveData?: boolean;
}

const SLOW_CONNECTIONS = new Set(['slow-2g', '2g']);
// Safari has no requestIdleCallback; a short delay after load stands in.
const IDLE_FALLBACK_DELAY_MS = 200;

const warmers = new Set<Warmer>();
let warmed = false;
let activeGates = 0;
let idleScheduled = false;

/**
 * Register the import that loads the dialog.
 *
 * @param warmer - Starts the import. Called on every warm, so it must share
 * one in-flight request and retry after a failure.
 * @returns A function that unregisters the warmer.
 */
export const registerDialogWarmer = function registerDialogWarmer(
	warmer: Warmer
): () => void {
	warmers.add(warmer);
	// An intent signal can arrive before the dialog mounts.
	if (warmed) {
		warmer();
	}
	return () => {
		warmers.delete(warmer);
	};
};

/** Start loading the dialog now. Repeated calls share one import. */
export const warmDialog = function warmDialog(): void {
	warmed = true;
	for (const warmer of warmers) {
		warmer();
	}
};

/**
 * Idle loading spends bytes the visitor may never need, so it stays off
 * when they asked to save data, on 2G-class connections, and while offline.
 * Intent loading is unaffected.
 */
const idleWarmingAllowed = function idleWarmingAllowed(): boolean {
	if (typeof navigator === 'undefined' || navigator.onLine === false) {
		return false;
	}
	const { connection } = navigator as Navigator & {
		connection?: NetworkInformationLike;
	};
	if (connection?.saveData === true) {
		return false;
	}
	return !SLOW_CONNECTIONS.has(connection?.effectiveType ?? '');
};

const warmWhenIdle = function warmWhenIdle(): void {
	idleScheduled = false;
	// The opener may have unmounted before idle time.
	if (activeGates > 0 && idleWarmingAllowed()) {
		warmDialog();
	}
};

/** Runs `run` in the first idle period after the page's load event. */
const afterPageLoadIdle = function afterPageLoadIdle(
	run: () => void
): () => void {
	let cancelled = false;
	let idle: number | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const runOnce = () => {
		if (!cancelled) {
			run();
		}
	};
	const afterLoad = () => {
		if (cancelled) {
			return;
		}
		if (typeof window.requestIdleCallback === 'function') {
			idle = window.requestIdleCallback(runOnce);
		} else {
			timer = setTimeout(runOnce, IDLE_FALLBACK_DELAY_MS);
		}
	};
	if (document.readyState === 'complete') {
		afterLoad();
	} else {
		window.addEventListener('load', afterLoad, { once: true });
	}
	return () => {
		cancelled = true;
		window.removeEventListener('load', afterLoad);
		if (idle !== undefined) {
			window.cancelIdleCallback?.(idle);
		}
		clearTimeout(timer);
	};
};

/**
 * Runs `run` on the boundary idle dialog loading uses: the first idle
 * period after the page's load event. It does not run when idle loading is
 * off for the visitor's connection.
 *
 * @returns Cancels it, if it has not run.
 * @internal
 */
export const whenPageIdle = function whenPageIdle(run: () => void): () => void {
	if (typeof window === 'undefined' || !idleWarmingAllowed()) {
		return () => undefined;
	}
	return afterPageLoadIdle(() => {
		if (idleWarmingAllowed()) {
			run();
		}
	});
};

const scheduleIdleWarm = function scheduleIdleWarm(): void {
	if (idleScheduled || warmed || !idleWarmingAllowed()) {
		return;
	}
	idleScheduled = true;
	afterPageLoadIdle(warmWhenIdle);
};

/**
 * Keep an idle-loading gate open until the returned function is called.
 * The dialog loads in the first idle period after the page's load event if
 * a gate is still open then. Call it after the opener renders in the browser; nothing runs on the server.
 *
 * @param preload - The provider's `preloadDialog` option.
 * @returns Releases the gate.
 */
export const holdIdleDialogWarming = function holdIdleDialogWarming(
	preload: DialogPreload | undefined
): () => void {
	if ((preload ?? 'idle') !== 'idle' || typeof window === 'undefined') {
		return () => {
			/* nothing held */
		};
	}
	activeGates += 1;
	scheduleIdleWarm();
	let released = false;
	return () => {
		if (!released) {
			released = true;
			activeGates -= 1;
		}
	};
};

/**
 * Reset module state between tests.
 *
 * @internal
 */
export const resetDialogWarmingForTests =
	function resetDialogWarmingForTests(): void {
		warmers.clear();
		warmed = false;
		activeGates = 0;
		idleScheduled = false;
	};
