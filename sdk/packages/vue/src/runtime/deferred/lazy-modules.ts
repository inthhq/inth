/**
 * Which server-rendered c15t modules a deferred visitor's HTML should not
 * preload: the stock banner's components below `ConsentRoot`, which
 * hydrate only once the consent engine loads.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * A c15t component's module, as Vite names it in `ssrContext.modules`:
 * `…/@c15t/vue/dist/…` from an installed package, `…/packages/vue/dist/…`
 * from a workspace or linked install (Vite names the real path), and
 * `…/packages/vue/src/…` in this repository's tests.
 */
const CONSENT_COMPONENT_MODULE =
	/(?:@c15t\/vue|packages\/vue)\/(?:dist|src)\/runtime\/components\//u;

/**
 * The module's global components. A page that renders one hydrates it
 * with the app, so its chunk keeps its preload.
 */
const GLOBAL_COMPONENT_MODULE =
	/\/(?:nuxt-root|preferences|consent-gate|consent-dialog-link|panel-trigger)\.vue$/u;

/**
 * Whether a server-rendered module is one of the stock banner's components,
 * whose chunk a deferred visitor's browser loads with the engine.
 *
 * @param id - A module id from `ssrContext.modules`.
 * @returns `true` when the HTML should not preload its chunk.
 * @internal
 */
export const isDeferredBannerModule = function isDeferredBannerModule(
	id: string
): boolean {
	return CONSENT_COMPONENT_MODULE.test(id) && !GLOBAL_COMPONENT_MODULE.test(id);
};
