/**
 * The static banner `consentManifest()` puts in a client-rendered page's
 * `index.html` (`@inth/react/static-banner`). The app's banner takes its
 * place when it renders.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * Attribute on the static banner's wrapper; `STATIC_BANNER_ATTR` in
 * `@inth/sdk/engine`, copied so the banner's chunk does not import the build's
 * script text. A test keeps them equal.
 *
 * @internal
 */
export const STATIC_BANNER_ATTR = 'data-c15t-static-banner';

/**
 * Whether the page shows a static banner now: its inline script revealed
 * it, whether or not a tap has hidden it since.
 *
 * @returns `true` when one is on the page and not `hidden`.
 * @internal
 */
export const isStaticBannerShown = function isStaticBannerShown(): boolean {
	return (
		typeof document !== 'undefined' &&
		document.querySelector(`[${STATIC_BANNER_ATTR}]:not([hidden])`) !== null
	);
};

/**
 * Removes the static banner, shown or not. Called in the same commit that
 * mounts the app's banner, before the browser paints, so one replaces the
 * other within a frame; and when the app's state says no banner.
 *
 * @internal
 */
export const removeStaticBanner = function removeStaticBanner(): void {
	if (typeof document === 'undefined') {
		return;
	}
	for (const shell of document.querySelectorAll(`[${STATIC_BANNER_ATTR}]`)) {
		shell.remove();
	}
};
