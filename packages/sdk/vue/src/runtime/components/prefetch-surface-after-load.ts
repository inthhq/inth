/**
 * Prefetch a surface chunk WITHOUT competing with the critical path.
 *
 * Measured: prefetching on bare requestIdleCallback fired during the loading
 * window under CPU throttle and made banner-visible ~130ms WORSE on the SPA
 * arm. So we wait for the window `load` event first (banner is visible well
 * before it), then an idle slot.
 */
export const prefetchSurfaceAfterLoad = function prefetchSurfaceAfterLoad(
	load: () => Promise<unknown>
): void {
	if (typeof window === 'undefined') {
		return;
	}
	const schedule = () => {
		const idle =
			'requestIdleCallback' in window
				? (handler: () => void) =>
						(
							window as Window & {
								requestIdleCallback: (handler: () => void) => void;
							}
						).requestIdleCallback(handler)
				: (handler: () => void) => setTimeout(handler, 1500);
		idle(() => {
			void load();
		});
	};
	if (document.readyState === 'complete') {
		schedule();
	} else {
		window.addEventListener('load', schedule, { once: true });
	}
};
