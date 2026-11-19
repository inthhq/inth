/**
 * Which server-rendered Inth modules a deferred visitor's HTML should not
 * preload: the stock banner's components below `ConsentRoot`, which
 * hydrate only once the consent engine loads.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * An Inth component's module, as Vite names it in `ssrContext.modules`:
 * `…/@inth/vue/dist/…` from an installed package, `…/packages/sdk/vue/dist/…`
 * from a workspace or linked install (Vite names the real path), and
 * `…/packages/sdk/vue/src/…` in this repository's tests.
 */
const CONSENT_COMPONENT_MODULE =
	/(?:@inth\/vue|packages\/(?:sdk\/)?vue)\/(?:dist|src)\/runtime\/components\//u;

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
 * @internal
 */
export const isDeferredBannerModule = function isDeferredBannerModule(
	id: string
): boolean {
	return CONSENT_COMPONENT_MODULE.test(id) && !GLOBAL_COMPONENT_MODULE.test(id);
};
