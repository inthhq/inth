import { resolve } from 'node:path';

import { GLOBAL_COMPONENTS } from '../global-components';
import {
	BANNER_SOURCE,
	BROWSER_RESOLVER_SOURCE,
	DEFERRED_ENGINE_MANIFEST_KEY,
	ENGINE_SOURCES,
	FIRST_BANNER_SOURCES,
	IAB_FIRST_BANNER_SOURCES,
} from './consent-prefetch.model';
import type {
	ClientManifestChunk,
	ConsentPrefetchOptions,
} from './consent-prefetch.model';

/**
 * Inth components a page renders before any tap, lazily loaded but needed
 * to hydrate it: every component the module registers globally, built or
 * loaded from source. A chunk the banner shares with one keeps its
 * priority.
 */
const PAGE_COMPONENT_SOURCES = GLOBAL_COMPONENTS.flatMap(([, file]) => [
	`/dist/runtime/components/${file}.vue`,
	`/src/runtime/components/${file}.vue`,
]);

/**
 * The stock banner's source, built (`dist`) or loaded from a linked
 * checkout (`src`), as {@link ENGINE_SOURCES} lists the engine's.
 */
const BANNER_SOURCES = [
	BANNER_SOURCE,
	'/src/runtime/components/prompt/prompt.vue',
];

/**
 * Each built source path with its counterpart in a linked checkout:
 * `/dist/` becomes `/src/`, and a `.js` file its `.ts` source.
 */
const withSource = (sources: readonly string[]): string[] =>
	sources.flatMap((source) => [
		source,
		source.replace('/dist/', '/src/').replace(/\.js$/u, '.ts'),
	]);

/** A script chunk, with Vite's `.js` or an ESM `.mjs` output name. */
const SCRIPT_FILE = /\.m?js$/u;

/**
 * The stock banner's own files: its chunk and the chunks it imports, less
 * any the app or the consent engine needs. The server lowers the priority
 * of their preloads (`runtime/server/banner-preload-priority.model.ts`), so they
 * download behind the page's own images and scripts.
 *
 * Only the banner's: the app hydrates without it (`LazyConsentBanner` is
 * not suspensible), and a visitor the engine serves at once, such as a
 * returning one, mostly never sees it. The engine stays at its priority,
 * since the plugin awaits it before the app mounts. A chunk the app needs
 * (one the entry, a page or a component outside Inth imports) keeps its
 * priority too, as does one an Inth chunk the page may need before its first
 * banner imports: the experiment controller, the IAB banner when the build
 * turns IAB on, and the browser resolver when the mode uses it (the chunks
 * `stopPrefetchingConsentChunks` keeps hinting), and the components
 * a page renders before any tap (see `PAGE_COMPONENT_SOURCES`). The server
 * lowers them only on a page that renders no banner.
 *
 * Call it after every other edit of the manifest.
 *
 * @param srcDir - The directory manifest sources are relative to.
 * @returns The files, relative to the build assets directory, as the
 * manifest names them. Empty when the build has no stock banner chunk, or
 * every page preloads it with the entry (`ssr: false`).
 * @internal
 */
export const bannerOnlyFiles = function bannerOnlyFiles(
	manifest: Record<string, ClientManifestChunk>,
	srcDir: string,
	isConsentFile: (file: string) => boolean,
	options: ConsentPrefetchOptions = {}
): string[] {
	const reach = (keys: readonly string[]): Set<string> => {
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
		for (const key of keys) {
			visit(key);
		}
		return reached;
	};
	const banner = Object.keys(manifest).filter(
		(key) =>
			manifest[key]?.isDynamicEntry &&
			BANNER_SOURCES.some((source) => manifest[key]?.src?.endsWith(source))
	);
	const startup = [
		...ENGINE_SOURCES,
		...PAGE_COMPONENT_SOURCES,
		...withSource([
			...FIRST_BANNER_SOURCES,
			...(options.browserResolve ? [BROWSER_RESOLVER_SOURCE] : []),
			...(options.iab ? IAB_FIRST_BANNER_SOURCES : []),
		]),
	];
	const engine = Object.keys(manifest).filter(
		(key) =>
			key === DEFERRED_ENGINE_MANIFEST_KEY ||
			(manifest[key]?.isDynamicEntry &&
				startup.some((source) => manifest[key]?.src?.endsWith(source)))
	);
	const needed = Object.keys(manifest).filter((key) => {
		const chunk = manifest[key];
		return (
			chunk?.isEntry ||
			(chunk?.isDynamicEntry &&
				chunk.src !== undefined &&
				!isConsentFile(resolve(srcDir, chunk.src)))
		);
	});
	// By file, not key: `DEFERRED_ENGINE_MANIFEST_KEY` copies the engine's
	// entry, and with `ssr: false` the entry imports the banner under its
	// own key.
	const kept = new Set(
		[...reach([...needed, ...engine])].map((key) => manifest[key]?.file)
	);
	const files: string[] = [];
	for (const key of reach(banner)) {
		const file = manifest[key]?.file;
		if (file && SCRIPT_FILE.test(file) && !kept.has(file)) {
			files.push(file);
		}
	}
	return files;
};
