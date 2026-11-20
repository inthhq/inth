/**
 * Stock surfaces a client-rendered root loads with its stand-in rather
 * than with the page. A surface module the app imports registers how to
 * load its code; the root calls them once it reads the `/v1/consent/init` answer, so
 * a surface the app does not use is never fetched.
 *
 * @packageDocumentation
 * @internal
 */

const warmers = new Set<() => void>();

/**
 * Registers how to load a surface's code.
 *
 * @param warm - Starts loading. Called at most once per {@link warmSurfaces}.
 * @internal
 */
export const addSurfaceWarmer = function addSurfaceWarmer(
	warm: () => void
): void {
	warmers.add(warm);
};

/**
 * Starts loading every registered surface's code.
 *
 * @internal
 */
export const warmSurfaces = function warmSurfaces(): void {
	for (const warm of warmers) {
		warm();
	}
};
