/**
 * `@c15t/svelte/vite` — build-time help for Svelte and SvelteKit apps.
 *
 * {@link consentManifest} serves the consent manifest the build downloads.
 * In a SvelteKit build it also lets `c15tHandle` preload the on-demand
 * chunk that holds the script loader and the network blocker, on the pages
 * that configure `scripts` or blocker rules, so it arrives with the app's
 * code instead of one round trip after it.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createConsentManifestPlugin } from '@c15t/core/build';
import type {
	ConsentManifestPlugin,
	ConsentManifestPluginOptions,
} from '@c15t/core/build';

// With its extension: Node loads this file straight from `dist`, unbundled.
import { MODULE_PRELOAD_PLACEHOLDERS } from './kit/module-preload.js';
import type { PreloadChunkName } from './kit/module-preload.js';

export type {
	ConsentManifest,
	ConsentManifestPluginOptions,
	ManifestBuildErrorMode,
	ManifestBuildOptions,
} from '@c15t/core/build';

/** The plugin `sveltekit()` adds first, which marks a SvelteKit app. */
const SVELTEKIT_PLUGIN = 'vite-plugin-sveltekit-setup';

/** The slice of Vite's resolved config {@link ServerGeneratedPlugin} edits. */
interface ExternalConfigLike {
	environments?: Record<string, { resolve?: { external?: unknown } }>;
	ssr?: { external?: unknown };
}

/** The plugin that keeps `@c15t/core` bundled in dev SSR. */
export interface ServerGeneratedPlugin {
	configResolved: (config: ExternalConfigLike) => void;
	name: string;
}

/**
 * `vite-plugin-svelte` marks a Svelte library's plain dependencies as SSR
 * externals, so in `vite dev` Node loads `@c15t/core` itself. Its
 * `@c15t/core/generated` is then the empty stand-in, and `loadConsent`
 * sees no snapshot or backend URL. Dropping `@c15t/core` from the externals
 * lets Vite resolve that import to the build's virtual module, as it does
 * in `vite build`.
 *
 * @returns The Vite plugin.
 * @internal
 */
export const createServerGeneratedPlugin =
	function createServerGeneratedPlugin(): ServerGeneratedPlugin {
		const keepCore = (external: unknown): void => {
			if (!Array.isArray(external)) {
				return;
			}
			for (let index = external.length - 1; index >= 0; index -= 1) {
				if (external[index] === '@c15t/core') {
					external.splice(index, 1);
				}
			}
		};
		return {
			configResolved(config) {
				keepCore(config.ssr?.external);
				for (const environment of Object.values(config.environments ?? {})) {
					keepCore(environment.resolve?.external);
				}
			},
			name: 'c15t:svelte-server-generated',
		};
	};

/** The module each on-demand chunk starts from. */
const CHUNK_MODULES: Readonly<Record<PreloadChunkName, RegExp>> = {
	engine:
		/[\\/](?:@c15t[\\/]svelte|packages[\\/](?:sdk[\\/])?svelte)[\\/](?:dist|src[\\/]lib)[\\/]deferred[\\/]engine\.[cm]?[jt]s$/u,
	'loader-and-blocker':
		/[\\/](?:@c15t[\\/]core|packages[\\/](?:sdk[\\/])?core)[\\/](?:dist|src)[\\/]modules[\\/]loader-and-blocker\.[cm]?[jt]s$/u,
};

const CHUNK_NAMES = Object.keys(CHUNK_MODULES) as PreloadChunkName[];

/** The slice of a Rollup/Rolldown output chunk this plugin reads. */
interface OutputChunkLike {
	fileName: string;
	isEntry: boolean;
	moduleIds?: readonly string[];
	modules?: Readonly<Record<string, unknown>>;
	type: 'chunk';
}

/** The slice of SvelteKit's validated `kit` config this plugin reads. */
interface KitConfigLike {
	outDir?: string;
	paths?: { assets?: string; base?: string };
}

/** The slice of Vite's resolved config this plugin reads. */
interface ResolvedConfigLike {
	build: { ssr?: unknown };
	plugins: readonly { api?: unknown; name: string }[];
	root: string;
}

/**
 * The module-preload plugin {@link consentManifest} includes, typed
 * structurally so it fits the `plugins` array of every Vite version
 * SvelteKit supports.
 */
export interface ModulePreloadPlugin {
	apply: 'build';
	configResolved: (config: ResolvedConfigLike) => void;
	name: string;
	writeBundle: (
		this: { environment?: { name: string } },
		options: unknown,
		bundle: Record<string, { type: string }>
	) => Promise<void>;
}

/**
 * Each on-demand chunk's URL in a client build, or `''` for one the build
 * put in an entry chunk (the page loads it anyway) or left out.
 *
 * @param bundle - The client build's output.
 * @param base - Where the client output is served from (`paths.assets`,
 * else `paths.base`).
 * @returns The URL per chunk name.
 * @internal
 */
export const resolveChunkHrefs = function resolveChunkHrefs(
	bundle: Record<string, { type: string }>,
	base: string
): Record<PreloadChunkName, string> {
	const hrefs: Record<PreloadChunkName, string> = {
		engine: '',
		'loader-and-blocker': '',
	};
	for (const output of Object.values(bundle)) {
		if (output.type !== 'chunk') {
			continue;
		}
		const chunk = output as OutputChunkLike;
		const ids = chunk.moduleIds ?? Object.keys(chunk.modules ?? {});
		for (const name of CHUNK_NAMES) {
			if (ids.some((id) => CHUNK_MODULES[name].test(id))) {
				hrefs[name] = chunk.isEntry ? '' : `${base}/${chunk.fileName}`;
			}
		}
	}
	return hrefs;
};

/** Every `.js`/`.mjs` file under a directory. */
const listScripts = async function listScripts(
	directory: string
): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(directory, { recursive: true });
	} catch {
		return [];
	}
	return entries
		.filter((entry) => /\.m?js$/u.test(entry))
		.map((entry) => path.join(directory, entry));
};

/**
 * Write each chunk URL over its placeholder in every server file that has
 * one.
 *
 * @param serverDirectory - SvelteKit's server output.
 * @param hrefs - The URL per chunk name; `''` drops the link.
 * @returns The files changed.
 * @internal
 */
export const writeChunkHrefs = async function writeChunkHrefs(
	serverDirectory: string,
	hrefs: Readonly<Record<PreloadChunkName, string>>
): Promise<string[]> {
	const files = await listScripts(serverDirectory);
	const changed = await Promise.all(
		files.map(async (file) => {
			const source = await readFile(file, 'utf8');
			let next = source;
			for (const name of CHUNK_NAMES) {
				next = next.replaceAll(MODULE_PRELOAD_PLACEHOLDERS[name], hrefs[name]);
			}
			if (next === source) {
				return null;
			}
			await writeFile(file, next);
			return file;
		})
	);
	return changed.filter((file): file is string => file !== null);
};

/**
 * Vite plugin that tells `c15tHandle` where the client build put the
 * chunk that holds the script loader and the network blocker.
 *
 * SvelteKit builds the server first, so the server cannot know client
 * chunk names. After the client build writes its chunks, this plugin
 * writes their URLs into the server output, before SvelteKit prerenders
 * and before an adapter copies it. `c15tHandle` then adds a
 * `<link rel="modulepreload">` for that chunk to every page whose provider
 * has non-empty `scripts` or blocker rules. Pages without either get no
 * link and never fetch the chunk.
 *
 * Only builds are affected. Outside SvelteKit (a Vite single-page app)
 * the plugin does nothing: there is no server render to put a link in.
 * {@link consentManifest} includes it.
 *
 * @returns The Vite plugin.
 * @internal
 */
export const createModulePreloadPlugin =
	function createModulePreloadPlugin(): ModulePreloadPlugin {
		let kit: KitConfigLike | undefined;
		// Empty resolves against the working directory, as Vite does.
		let root = '';
		let ssr = false;
		return {
			apply: 'build',
			configResolved(config) {
				({ root } = config);
				ssr = Boolean(config.build.ssr);
				const setup = config.plugins.find(
					(plugin) => plugin.name === SVELTEKIT_PLUGIN
				);
				// SvelteKit 2 nests its options under `kit` (svelte.config.js);
				// SvelteKit 3 takes them flat, from `sveltekit({ ... })`.
				const options = (
					setup?.api as
						| { options?: KitConfigLike & { kit?: KitConfigLike } }
						| undefined
				)?.options;
				kit = options?.kit ?? options;
			},
			name: 'c15t:module-preload',
			async writeBundle(_options, bundle) {
				// SvelteKit 3 builds every environment with one plugin instance;
				// SvelteKit 2 starts a separate client build.
				const client = this.environment
					? this.environment.name === 'client'
					: !ssr;
				if (!kit || !client) {
					return;
				}
				const { assets = '', base = '' } = kit.paths ?? {};
				await writeChunkHrefs(
					path.resolve(root, kit.outDir ?? '.svelte-kit', 'output', 'server'),
					resolveChunkHrefs(bundle, assets || base)
				);
			},
		};
	};

/**
 * The small `@c15t/core` and `@c15t/ui` modules that `ConsentRoot`'s
 * first-load code shares with the consent engine: the consent, vendor,
 * experiment and policy helpers the surfaces read, and what records a tap
 * before the engine.
 *
 * Only modules the first load imports belong here: the group puts every
 * module it matches in the first-load chunk. The surfaces read vendors and
 * experiments through `vendor-listing`, `vendor-allowed`, `vendor-denial`
 * and `experiment-presentation`, so `vendors`, `experiment`, `modules/has`
 * and the record evaluator stay with the engine.
 *
 * Vite's preload helper joins them: the first load's dynamic imports use
 * it, and it rode in this chunk before through `experiment`. On its own
 * it costs the page one more request.
 */
const FIRST_LOAD_SHARED =
	/^\0vite[\\/]preload-helper\.js$|[\\/]node_modules[\\/]@c15t[\\/](?:core[\\/]dist[\\/](?:libs[\\/](?:has|experiment-presentation|vendor-listing|policy-actions|is-production|storage-keys|generate-subject-id)|consent[\\/]consent-types|modules[\\/]vendor-(?:allowed|denial)|consent-record[\\/]types|surface-actions[\\/]instant-commit|derive-surface)|ui[\\/]dist[\\/]utils[\\/]text-direction)\.js$/u;

/** The slice of Rolldown's output options {@link FirstLoadChunkPlugin} edits. */
interface OutputOptionsLike {
	advancedChunks?: unknown;
	codeSplitting?: boolean | { groups?: unknown[] };
	inlineDynamicImports?: boolean;
	manualChunks?: unknown;
}

/**
 * What the plugin returns: the app's options with the group added.
 * `inlineDynamicImports` is there so the type fits Rollup's
 * `OutputOptions`, whose keys are all optional.
 */
interface ChunkedOutputOptions {
	codeSplitting: { groups: unknown[] };
	inlineDynamicImports?: boolean;
}

/**
 * The plugin context the hook reads. `watchMode`, which Rollup's and
 * Rolldown's `meta` both have, lets Rollup's context fit the type.
 */
interface OutputHookContext {
	environment?: { name: string };
	meta: { rolldownVersion?: string; watchMode: boolean };
}

/** The plugin that puts c15t's shared first-load modules in one chunk. */
export interface FirstLoadChunkPlugin {
	apply: 'build';
	name: string;
	outputOptions: (
		this: OutputHookContext,
		options: OutputOptionsLike
	) => ChunkedOutputOptions | undefined;
}

/**
 * Puts the small c15t modules that `ConsentRoot`'s first-load code shares
 * with the consent engine into one chunk, in the browser build of a Vite
 * that bundles with Rolldown (Vite 8).
 *
 * Rolldown gives each set of modules that the same chunks import a chunk
 * of its own. The engine, the commit path and the dialog each share a
 * different few of those modules with the page, so without this the page
 * fetches about a dozen c15t files of a few hundred bytes, each with its
 * own request and headers. Every module in the group already loads with a
 * page that renders `ConsentRoot`, so the page loads no more code, and the
 * on-demand chunks import from the merged one. Rollup (Vite 7 and earlier)
 * places a module its importer has loaded already, so the plugin leaves
 * it alone. It does nothing when the app sets `manualChunks` or
 * `advancedChunks`, or turns code splitting off; groups the app sets in
 * `codeSplitting` come first.
 *
 * {@link consentManifest} includes it.
 *
 * @returns The Vite plugin.
 * @internal
 */
export const createFirstLoadChunkPlugin =
	function createFirstLoadChunkPlugin(): FirstLoadChunkPlugin {
		return {
			apply: 'build',
			name: 'c15t:first-load-chunk',
			outputOptions(options) {
				const { codeSplitting } = options;
				if (
					this.environment?.name !== 'client' ||
					!this.meta.rolldownVersion ||
					options.manualChunks !== undefined ||
					options.advancedChunks !== undefined ||
					options.inlineDynamicImports === true ||
					codeSplitting === false
				) {
					return undefined;
				}
				const settings = typeof codeSplitting === 'object' ? codeSplitting : {};
				return {
					...options,
					codeSplitting: {
						...settings,
						groups: [
							...(settings.groups ?? []),
							{
								debugName: 'c15t',
								name: 'c15t',
								test: FIRST_LOAD_SHARED,
							},
						],
					},
				};
			},
		};
	};

/**
 * Serves the deployment's consent manifest and backend URL as the virtual
 * module `@c15t/core/generated` (also `c15t/generated`). Import `snapshot`
 * from it; no file is written into the app. `vite build` fetches the
 * manifest only when the bundle reads `snapshot`: a Svelte app that uses
 * `hosted()` or `local()` never depends on the backend at build time.
 *
 * In a SvelteKit app (the `sveltekit()` plugin is present), the snapshot
 * stays on the server: in the client environment, `snapshot` is
 * `undefined`. A Svelte single-page app receives it in the browser.
 * `projectUrl` is public and reaches both.
 *
 * `projectUrl` defaults to `PUBLIC_C15T_BACKEND_URL` (SvelteKit), then
 * `VITE_C15T_BACKEND_URL`, then the Inth variables `PUBLIC_INTH_PROJECT_URL`
 * and `VITE_INTH_PROJECT_URL`, including `.env` files. When
 * `VITE_C15T_BACKEND_URL` is unset, the plugin sets
 * `import.meta.env.VITE_C15T_BACKEND_URL` to the URL it used, so app code
 * reads the same value. A missing URL or a failed fetch warns, and
 * `snapshot` is `undefined`, so the policy is read at runtime, from the
 * backend's `/init` while the manifest is unavailable. Set
 * `onBuildError: 'fail'` or `C15T_ON_BUILD_ERROR=fail` to stop the build
 * instead. In a Svelte
 * single-page app whose policy depends on the visitor's location, the
 * build warns and suggests `hosted()`. With `manifest({ manifestUrl })` or
 * `manifest({ source: 'runtime' })`, pass `source: 'runtime'` here too, so
 * the build never fetches a snapshot the app would discard.
 *
 * In a SvelteKit build it also writes the URL of the on-demand chunk that
 * holds the script loader and the network blocker into the server output,
 * so `c15tHandle` adds a `<link rel="modulepreload">` for it to every page
 * whose provider has `scripts` or blocker rules. With Vite 8 it puts the
 * small modules c15t's first-load code shares with the consent engine into
 * one chunk ({@link createFirstLoadChunkPlugin}).
 *
 * @param options - Backend URL, `onBuildError` and `source`. Appends
 * `/manifest`.
 * @returns The Vite plugins, for `plugins`.
 * @throws {Error} When the fetch fails in `'fail'` mode, the default for
 * `vite build`.
 * @example
 * ```ts
 * // vite.config.ts
 * import { consentManifest } from '@c15t/svelte/vite';
 * import { svelte } from '@sveltejs/vite-plugin-svelte';
 *
 * export default { plugins: [consentManifest(), svelte()] };
 * ```
 */
export const consentManifest = (
	options: ConsentManifestPluginOptions = {}
): [
	ConsentManifestPlugin,
	ModulePreloadPlugin,
	ServerGeneratedPlugin,
	FirstLoadChunkPlugin,
] => [
	createConsentManifestPlugin(options, {
		// A Svelte single-page app only: SvelteKit resolves on the server.
		adviseHostedForLocation: true,
		envNames: [
			'PUBLIC_C15T_BACKEND_URL',
			'VITE_C15T_BACKEND_URL',
			'PUBLIC_INTH_PROJECT_URL',
			'VITE_INTH_PROJECT_URL',
		],
		label: '@c15t/svelte/vite',
		serverRendered: (config) =>
			config.plugins?.some((plugin) => plugin.name === SVELTEKIT_PLUGIN) ??
			false,
	}),
	createModulePreloadPlugin(),
	createServerGeneratedPlugin(),
	createFirstLoadChunkPlugin(),
];
