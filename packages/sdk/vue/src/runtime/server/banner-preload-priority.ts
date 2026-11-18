/**
 * Lowers the priority of the stock banner's preloads in a page's head.
 *
 * A server render whose visitor the engine serves at once (a returning
 * visitor, IAB, an experiment) renders the banner component, so Nuxt
 * preloads its chunks with the entry. At the default priority those
 * downloads share the connection with the page's hero image and hold back
 * its largest contentful paint, though the app hydrates without them and
 * such a visitor mostly never sees the banner. The engine's own preloads
 * keep their priority: the plugin awaits the engine before the app
 * mounts.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * The H3 event context key the plugin sets when a server render shows no
 * banner. Only then does the Nitro plugin lower the banner's preloads: a
 * visitor who sees the banner needs its chunks as soon as anything else.
 *
 * @internal
 */
export const QUIET_BANNER_CONTEXT_KEY = 'inthQuietBanner';

const MODULE_PRELOAD = /<link\b[^>]*\brel="modulepreload"[^>]*>/gu;
const HREF = /\bhref="(?<href>[^"]*)"/u;

/**
 * Adds `fetchpriority="low"` to the `modulepreload` links of `files`.
 *
 * @param head - Rendered head HTML.
 * @param files - The banner's files, relative to the build assets
 * directory, as `bannerOnlyFiles` names them. A link matches when its URL
 * ends with one under any base or CDN prefix.
 * @returns `head` with those links lowered.
 * @internal
 */
export const lowerBannerPreloads = function lowerBannerPreloads(
	head: string,
	files: readonly string[]
): string {
	return head.replace(MODULE_PRELOAD, (tag) => {
		const href = HREF.exec(tag)?.groups?.href;
		if (
			!href ||
			!files.some((file) => href.endsWith(`/${file}`)) ||
			tag.includes('fetchpriority=')
		) {
			return tag;
		}
		return tag.replace('<link', '<link fetchpriority="low"');
	});
};

/**
 * The page's head parts with the banner's preloads lowered, when the plugin
 * marked the render as showing no banner; otherwise `head` unchanged.
 *
 * @param head - Rendered head HTML parts.
 * @param files - The banner's files (`bannerOnlyFiles`).
 * @param context - The request's H3 event context.
 * @returns The head parts to render.
 * @internal
 */
export const quietBannerHead = function quietBannerHead(
	head: readonly string[],
	files: readonly string[],
	context: Readonly<Record<string, unknown>>
): string[] {
	if (files.length === 0 || context[QUIET_BANNER_CONTEXT_KEY] !== true) {
		return [...head];
	}
	return head.map((part) => lowerBannerPreloads(part, files));
};
