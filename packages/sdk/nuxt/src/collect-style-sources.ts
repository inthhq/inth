import type { Plugin } from 'vite';

import { QUERY_RE, baseName } from './style-sources.model';
import type { StyleSourceIndex } from './style-sources.model';

const STYLESHEET_RE = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss)$/u;

/**
 * Record which stylesheet modules end up in each CSS file of the client
 * build, and which modules import them. Nuxt's client manifest names a
 * chunk's CSS files but not their sources.
 *
 * @param index - Filled in when the client bundle is written.
 * @internal
 */
export const collectStyleSources = function collectStyleSources(
	index: StyleSourceIndex
): Plugin {
	return {
		apply: 'build',
		generateBundle(_options, bundle) {
			for (const output of Object.values(bundle)) {
				if (output.type !== 'chunk') {
					continue;
				}
				const files = output.viteMetadata?.importedCss;
				if (!files?.size) {
					continue;
				}
				const sources = output.moduleIds
					.filter((id) => STYLESHEET_RE.test(id.replace(QUERY_RE, '')))
					.map((id) => ({
						id,
						importers: [...(this.getModuleInfo(id)?.importers ?? [])],
					}));
				for (const file of files) {
					const name = baseName(file);
					index.set(name, [...(index.get(name) ?? []), ...sources]);
				}
			}
		},
		name: '@inth/nuxt:style-sources',
	};
};
