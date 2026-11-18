import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { GLOBAL_COMPONENTS } from './global-components';

/**
 * The part of a Nuxt client manifest entry this module reads and writes.
 * Declared here so the module does not depend on `vue-bundle-renderer`.
 */
export interface ClientManifestChunk {
	assets?: string[];
	css?: string[];
	dynamicImports?: string[];
	file?: string;
	imports?: string[];
	isDynamicEntry?: boolean;
	isEntry?: boolean;
	prefetch?: boolean;
	src?: string;
}

/**
 * Inth chunks a page may need before its first banner paints, so Nuxt keeps
 * prefetching them: the experiment controller. Matched against the end of
 * the source path, inside an Inth package. The IAB banner and the browser
 * resolver keep their hints only when the build uses them; see
 * {@link IAB_FIRST_BANNER_SOURCES} and {@link BROWSER_RESOLVER_SOURCE}.
 */
const FIRST_BANNER_SOURCES = ['/dist/libs/experiment-assignment.js'];

/**
 * The IAB banner and its CMP, kept like {@link FIRST_BANNER_SOURCES} only
 * when the build turns IAB on. Without it nothing loads them.
 */
const IAB_FIRST_BANNER_SOURCES = [
	'/iab/dist/headless.js',
	'/iab/dist/index.js',
	'/dist/libs/iab-banner-summary.js',
	'/dist/runtime/components/iab-prompt.vue',
];

/**
 * Core's browser resolver with English base copy. Other languages load on
 * demand. Only `manifest({ resolve: 'browser' })` loads it while the page
 * starts; no other mode loads it at all, so a hint there would download it
 * on every page for nothing.
 */
const BROWSER_RESOLVER_SOURCE = '/dist/transports/manifest-browser.js';

/** What the Nuxt module knows about the build when it edits the manifest. */
export interface ConsentPrefetchOptions {
	/**
	 * Whether the mode is `manifest({ resolve: 'browser' })`, the only mode
	 * that loads the browser resolver at startup. Defaults to `false`.
	 */
	browserResolve?: boolean;
	/**
	 * Whether the module options turn IAB on. Only then do the IAB banner
	 * and its CMP keep their hints. Defaults to `false`.
	 */
	iab?: boolean;
}

/**
 * Whether a file belongs to an SDK package (`@inth/*` other than the CLI), read from
 * the nearest `package.json` that names a package.
 * @internal
 */
export const createPackageCheck = function createPackageCheck(): (
	file: string
) => boolean {
	const byDirectory = new Map<string, boolean>();
	const check = (directory: string): boolean => {
		const cached = byDirectory.get(directory);
		if (cached !== undefined) {
			return cached;
		}
		let result = false;
		const manifest = join(directory, 'package.json');
		const parent = dirname(directory);
		let name: unknown;
		if (existsSync(manifest)) {
			try {
				({ name } = JSON.parse(readFileSync(manifest, 'utf8')) as {
					name?: unknown;
				});
			} catch {
				name = undefined;
			}
		}
		if (typeof name === 'string') {
			result = name.startsWith('@inth/') && name !== '@inth/cli';
		} else if (parent !== directory) {
			result = check(parent);
		}
		byDirectory.set(directory, result);
		return result;
	};
	return (file) => check(dirname(file));
};

/**
 * Stop Nuxt prefetching Inth chunks a page loads only after its first
 * banner, or only when it configures them: the script loader, network
 * blocker, data clearing and `consentSource` connection, live option
 * updates, the save path, the preference dialog (which Inth warms itself
 * once the page has loaded), and IAB unless the module options turn it on.
 *
 * Nuxt adds a `<link rel="prefetch">` for every chunk the entry imports
 * dynamically. Each download that finishes queues a task on the main
 * thread, so on a page whose `/init` answer arrives while they land, the
 * banner waits behind them. Chunks another part of the app also reaches
 * keep their hint.
 *
 * @param manifest - Nuxt's client manifest, edited in place.
 * @param srcDir - The directory manifest sources are relative to.
 * @param isConsentFile - Reads the nearest `package.json` by default.
 * @internal
 */
export const stopPrefetchingConsentChunks =
	function stopPrefetchingConsentChunks(
		manifest: Record<string, ClientManifestChunk>,
		srcDir: string,
		isConsentFile: (file: string) => boolean = createPackageCheck(),
		options: ConsentPrefetchOptions = {}
	): void {
		const isConsentSource = (chunk: ClientManifestChunk): boolean =>
			chunk.src !== undefined && isConsentFile(resolve(srcDir, chunk.src));
		const kept = [
			...FIRST_BANNER_SOURCES,
			...(options.browserResolve ? [BROWSER_RESOLVER_SOURCE] : []),
			...(options.iab ? IAB_FIRST_BANNER_SOURCES : []),
		];
		const deferred = new Set<string>();
		for (const [key, chunk] of Object.entries(manifest)) {
			if (
				chunk.isDynamicEntry &&
				isConsentSource(chunk) &&
				!kept.some((source) => chunk.src?.endsWith(source))
			) {
				deferred.add(key);
			}
		}
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
			if ((chunk.isEntry || chunk.isDynamicEntry) && !deferred.has(key)) {
				visit(key);
			}
		}
		const reachedStyles = new Set(
			[...reached].flatMap((key) => manifest[key]?.css ?? [])
		);
		const skip = (key: string): void => {
			const chunk = manifest[key];
			if (!chunk || reached.has(key) || chunk.prefetch === false) {
				return;
			}
			chunk.prefetch = false;
			for (const css of chunk.css ?? []) {
				const style = manifest[css];
				if (style && !reachedStyles.has(css)) {
					style.prefetch = false;
				}
			}
			for (const dependency of chunk.imports ?? []) {
				skip(dependency);
			}
		};
		for (const key of deferred) {
			skip(key);
		}
	};

const preloadWithEntry = function preloadWithEntry(
	manifest: Record<string, ClientManifestChunk>,
	srcDir: string,
	isConsentFile: (file: string) => boolean,
	source: string
): void {
	const target = Object.entries(manifest).find(
		([, chunk]) =>
			chunk.isDynamicEntry &&
			chunk.src?.endsWith(source) &&
			isConsentFile(resolve(srcDir, chunk.src))
	)?.[0];
	if (!target) {
		return;
	}
	for (const chunk of Object.values(manifest)) {
		if (chunk.isEntry && !chunk.imports?.includes(target)) {
			chunk.imports = [...(chunk.imports ?? []), target];
		}
	}
};

/** The banner the Nuxt root loads as its own chunk (see `nuxt-root.vue`). */
const BANNER_SOURCE = '/dist/runtime/components/prompt.vue';

/**
 * Preload the banner chunk with the entry on every page.
 *
 * Nuxt's root imports the banner dynamically, so its stylesheets stay out
 * of the entry. Nuxt preloads a dynamic chunk only when the page server
 * renders it; elsewhere (an `ssr: false` shell, a prerendered page, a
 * visitor whose banner the browser opens later) the browser would find it
 * only after the entry runs, and the banner would wait for it after
 * `/init`. Listed among the entry's imports in the manifest, the chunk and
 * its imports get a `modulepreload` link in every page's HTML, as when the
 * banner was part of the entry. The browser still loads the chunk with a
 * dynamic import, which brings its stylesheets.
 *
 * Call it after `preloadInlinedConsentStyles`, which reads the
 * entry's real static imports.
 *
 * @param manifest - Nuxt's client manifest, edited in place.
 * @param srcDir - The directory manifest sources are relative to.
 * @internal
 */
export const preloadConsentBanner = function preloadConsentBanner(
	manifest: Record<string, ClientManifestChunk>,
	srcDir: string,
	isConsentFile: (file: string) => boolean
): void {
	preloadWithEntry(manifest, srcDir, isConsentFile, BANNER_SOURCE);
};

/**
 * Preload the browser resolver with the entry, for
 * `manifest({ resolve: 'browser' })`. The app imports it when the runtime is
 * built, so a page that only learns of it from the entry would wait a round
 * trip for it before the banner can resolve. Same mechanism as
 * {@link preloadConsentBanner}.
 *
 * @param manifest - Nuxt's client manifest, edited in place.
 * @param srcDir - The directory manifest sources are relative to.
 * @internal
 */
export const preloadBrowserResolver = function preloadBrowserResolver(
	manifest: Record<string, ClientManifestChunk>,
	srcDir: string,
	isConsentFile: (file: string) => boolean
): void {
	preloadWithEntry(manifest, srcDir, isConsentFile, BROWSER_RESOLVER_SOURCE);
};

/** The Nuxt plugin's consent engine chunk (`runtime/deferred/engine.ts`). */
const ENGINE_SOURCES = [
	'/dist/runtime/deferred/engine.js',
	'/src/runtime/deferred/engine.ts',
];

/**
 * The client manifest key `runtime/deferred/boot.ts` names. Kept equal by a
 * test.
 */
export const DEFERRED_ENGINE_MANIFEST_KEY = 'inth:deferred-engine';

/**
 * Name the engine chunk under a key the server render knows.
 *
 * The plugin loads the engine with a dynamic import. A server render whose
 * visitor needs it at once (a returning visitor, IAB, an experiment) adds
 * {@link DEFERRED_ENGINE_MANIFEST_KEY} to the request's modules, and Nuxt
 * preloads the chunk and its imports with the entry; a deferred visitor's
 * HTML does not. The source path the manifest keys the chunk by depends on
 * the install, so the module copies its entry under a fixed key. With
 * `ssr: false` no page renders on the server, so every page preloads the
 * engine and the banner with the entry instead.
 *
 * Call it after {@link stopPrefetchingConsentChunks}.
 *
 * @param manifest - Nuxt's client manifest, edited in place.
 * @param srcDir - The directory manifest sources are relative to.
 * @internal
 */
export const preloadDeferredEngine = function preloadDeferredEngine(
	manifest: Record<string, ClientManifestChunk>,
	srcDir: string,
	isConsentFile: (file: string) => boolean,
	ssr: boolean
): void {
	const source = ENGINE_SOURCES.find((candidate) =>
		Object.values(manifest).some(
			(chunk) =>
				chunk.isDynamicEntry &&
				chunk.src?.endsWith(candidate) &&
				isConsentFile(resolve(srcDir, chunk.src))
		)
	);
	if (!source) {
		return;
	}
	const [key, chunk] = Object.entries(manifest).find(
		([, entry]) => entry.isDynamicEntry && entry.src?.endsWith(source)
	) as [string, ClientManifestChunk];
	manifest[DEFERRED_ENGINE_MANIFEST_KEY] = {
		...chunk,
		isDynamicEntry: false,
		prefetch: false,
		src: undefined,
	};
	if (!ssr) {
		preloadWithEntry(manifest, srcDir, isConsentFile, BANNER_SOURCE);
		for (const entry of Object.values(manifest)) {
			if (entry.isEntry && !entry.imports?.includes(key)) {
				entry.imports = [...(entry.imports ?? []), key];
			}
		}
	}
};

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
const BANNER_SOURCES = [BANNER_SOURCE, '/src/runtime/components/prompt.vue'];

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
 * of their preloads (`runtime/server/banner-preload-priority.ts`), so they
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
 * {@link stopPrefetchingConsentChunks} keeps hinting), and the components
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

/**
 * Drop the entry from the `imports` of chunks the entry itself imports
 * statically. Rolldown can list the entry there for a chunk that only loads
 * on demand from it, such as the Inth chunk group (`chunk-group.ts`), which
 * makes a cycle. Nuxt's renderer reads a cycle's far end as having no
 * dependencies, so the page would stop preloading the Inth chunk and the
 * browser would fetch it only after parsing the entry. The entry loads
 * first anyway, so the edge only ever repeated a preload.
 *
 * Edits the manifest in place.
 * @internal
 */
export const breakEntryImportCycles = function breakEntryImportCycles(
	manifest: Record<string, ClientManifestChunk>
): void {
	for (const [entry, chunk] of Object.entries(manifest)) {
		if (!chunk.isEntry) {
			continue;
		}
		const reached = new Set<string>();
		const visit = (key: string): void => {
			if (key === entry || reached.has(key)) {
				return;
			}
			reached.add(key);
			for (const dependency of manifest[key]?.imports ?? []) {
				visit(dependency);
			}
		};
		for (const dependency of chunk.imports ?? []) {
			visit(dependency);
		}
		for (const key of reached) {
			const imported = manifest[key];
			if (imported?.imports?.includes(entry)) {
				imported.imports = imported.imports.filter((id) => id !== entry);
			}
		}
	}
};
