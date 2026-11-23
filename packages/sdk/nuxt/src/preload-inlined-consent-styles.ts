import type { ClientManifestChunk } from './prefetch/consent-prefetch.model';
import { QUERY_RE, baseName } from './style-sources.model';
import type { StyleSourceIndex } from './style-sources.model';

/** Nuxt's `features.inlineStyles`, after Nuxt resolves it. */
export type InlineStylesOption = boolean | ((id?: string) => boolean);

/**
 * Turn the render-blocking `<link>`s Nuxt writes for Inth stylesheets it
 * already inlines into preloads, so they no longer hold the first paint.
 *
 * With `features.inlineStyles`, Nuxt writes the styles of every component
 * it server-renders into the HTML, and drops the `<link>` for a chunk named
 * after such a component. Inth's components share chunks (the banner and
 * the dialog use the same buttons), and those shared chunks kept their
 * render-blocking links next to the inlined copy of the same rules.
 *
 * A CSS file of a lazy chunk moves from the chunk's stylesheets to its
 * preloaded assets when every rule in it comes from an Inth stylesheet that
 * only Vue components import (Nuxt inlines those for each component it
 * renders), and no chunk the entry imports statically carries it. That
 * covers a component's own chunk too: Nuxt 4.6 bundles a component the
 * banner renders only sometimes, such as its legal links, into the
 * banner's chunk, and links that component's stylesheet whenever the
 * banner renders without it. A preloaded file Nuxt did inline gets no
 * hint, since Nuxt leaves inlined files out of its resource hints.
 *
 * The browser still
 * applies the file: a lazy chunk's dynamic import loads its stylesheets
 * before the component renders, so a surface the browser shows first, such
 * as the banner on an `ssr: false` route or the dialog, is styled when it
 * appears. The preload starts that download with the page, so a
 * server-rendered banner does not wait for it to hydrate.
 *
 * @param manifest - Nuxt's client manifest, edited in place.
 * @param index - The CSS file sources `collectStyleSources` recorded.
 * @internal
 */
export const preloadInlinedConsentStyles = function preloadInlinedConsentStyles(
	manifest: Record<string, ClientManifestChunk>,
	index: StyleSourceIndex,
	inlineStyles: InlineStylesOption,
	isConsentFile: (file: string) => boolean
): void {
	if (!inlineStyles || index.size === 0) {
		return;
	}
	const isInlined = (importer: string): boolean => {
		const path = importer.replace(QUERY_RE, '');
		return (
			path.endsWith('.vue') && (inlineStyles === true || inlineStyles(importer))
		);
	};
	const isInlinedConsentFile = (file: string): boolean => {
		const sources = index.get(baseName(file));
		return (
			sources !== undefined &&
			sources.length > 0 &&
			sources.every(
				(source) =>
					isConsentFile(source.id.replace(QUERY_RE, '')) &&
					source.importers.length > 0 &&
					source.importers.every(isInlined)
			)
		);
	};
	// The entry's stylesheets reach the browser only through the HTML.
	const reached = new Set<string>();
	const visit = (key: string): void => {
		if (reached.has(key)) {
			return;
		}
		reached.add(key);
		for (const dependency of manifest[key]?.imports ?? []) {
			visit(dependency);
		}
	};
	for (const [key, chunk] of Object.entries(manifest)) {
		if (chunk.isEntry) {
			visit(key);
		}
	}
	for (const [key, chunk] of Object.entries(manifest)) {
		if (!chunk.css?.length || reached.has(key)) {
			continue;
		}
		const inlined = chunk.css.filter(isInlinedConsentFile);
		if (inlined.length > 0) {
			chunk.css = chunk.css.filter((file) => !inlined.includes(file));
			chunk.assets = [...new Set([...(chunk.assets ?? []), ...inlined])];
		}
	}
};
