import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

import {
	createDialogChunkPlugin,
	legacyEnvName,
	loadManifestForBuild,
	readBuildEnvEntry,
} from '@inth/sdk/build';
import type { BuildEnvSource } from '@inth/sdk/build';
import type { ConsentMode } from '@inth/sdk/modes';
import { isIABConfigured } from '@inth/sdk/runtime';
import { defaultConsentConfig } from '@inth/sdk/schema/config';
import type { ConsentManifest } from '@inth/sdk/schema/types';
import {
	DEFAULT_CONSENT_ROUTE_PREFIX,
	normalizeRoutePrefix,
	resolveServerMode,
} from '@inth/sdk/server';
import {
	DEVTOOLS_ICON_ROUTE,
	DEVTOOLS_PAGE_ROUTE,
	NUXT_PROJECT_URL_ENV,
	NUXT_SERVER_PROJECT_URL_ENV,
	readNuxtRoutePrefix,
} from '@inth/vue/nuxt';
import type { NuxtMode } from '@inth/vue/nuxt';
import {
	addComponent,
	addImports,
	addPlugin,
	addServerHandler,
	addServerPlugin,
	addTemplate,
	addVitePlugin,
	addTypeTemplate,
	createResolver,
	defineNuxtModule,
	useLogger,
} from '@nuxt/kit';
import type { Nuxt, NuxtModule } from '@nuxt/schema';
import { defu } from 'defu';
import { joinURL } from 'ufo';
import type { Plugin as VitePlugin } from 'vite';

import { consentPackageDirs, groupConsentChunks } from './chunk-group';
import { readComposableExports } from './composable-exports';
import { GLOBAL_COMPONENTS } from './global-components';
import type { InthNuxtConfig, ModuleOptions } from './nuxt-options';
import {
	breakEntryImportCycles,
	createPackageCheck,
	bannerOnlyFiles,
	preloadBrowserResolver,
	preloadDeferredEngine,
	stopPrefetchingConsentChunks,
} from './prefetch';
import type { BuiltOptions } from './runtime/server/build-options';
import type { LegacyProjectUrlEnv } from './runtime/server/legacy-project-url';
import {
	collectStyleSources,
	preloadInlinedConsentStyles,
} from './stylesheets';
import type { StyleSourceIndex } from './stylesheets';

export {
	hosted,
	manifest,
	type ConsentMode,
	type HostedMode,
	type ManifestMode,
	type ManifestModeOptions,
	type TestingMode,
} from '@inth/sdk/modes';
export { defineTheme, type Theme } from '@inth/sdk/ui/theme';
// The types of the components and composables the module registers, so a
// Nuxt app needs only this package.
// oxlint-disable-next-line oxc/no-barrel-file -- Type-only: nothing loads at runtime.
export type * from '@inth/vue';

export type {
	InthNuxtAppConfig,
	InthNuxtConfig,
	ConsentModuleOptions,
	ModuleOptions,
} from './nuxt-options';

/**
 * The part of a Nuxt DevTools custom tab this module sends. Declared here
 * so the module does not depend on `@nuxt/devtools-kit` for one hook.
 */
interface DevToolsCustomTab {
	category?: 'app';
	icon?: string;
	name: string;
	title: string;
	view: { src: string; type: 'iframe' };
}

const isNuxtDevToolsEnabled = (nuxt: Nuxt): boolean => {
	const { devtools } = nuxt.options;
	return typeof devtools === 'boolean' ? devtools : devtools?.enabled !== false;
};

/**
 * Serve the tab page, expose the kernel to it from a client plugin, and
 * register the tab. Nuxt DevTools 4 keeps `devtools:customTabs` as a shim
 * over its dock system, so the same tab shows in both versions.
 */
const addDevToolsTab = (
	nuxt: Nuxt,
	resolve: (path: string) => string
): void => {
	const handler = resolve('./runtime/server/devtools.get');
	addServerHandler({ handler, method: 'get', route: DEVTOOLS_PAGE_ROUTE });
	addServerHandler({ handler, method: 'get', route: DEVTOOLS_ICON_ROUTE });
	// Appended so it runs after the consent plugin that provides the kernel;
	// addPlugin prepends by default.
	addPlugin(
		{ mode: 'client', src: resolve('./runtime/devtools/plugin.nuxt') },
		{ append: true }
	);
	const { baseURL } = nuxt.options.app;
	const hook = nuxt.hook as unknown as (
		name: 'devtools:customTabs',
		callback: (tabs: DevToolsCustomTab[]) => void
	) => void;
	hook('devtools:customTabs', (tabs) => {
		tabs.push({
			category: 'app',
			icon: joinURL(baseURL, DEVTOOLS_ICON_ROUTE),
			name: 'inth',
			title: 'Inth',
			view: { src: joinURL(baseURL, DEVTOOLS_PAGE_ROUTE), type: 'iframe' },
		});
	});
};

const renderSnapshotModule = (snapshot: ConsentManifest | undefined): string =>
	`export default ${snapshot ? JSON.stringify(snapshot) : 'undefined'};`;

/**
 * Where the build reads variables: the environment first (Nuxt loads
 * `.env` into it before the config), then the `.env` files in the root.
 */
const nuxtEnvSource = (nuxt: Nuxt): BuildEnvSource => ({
	mode: nuxt.options.dev ? 'development' : 'production',
	root: nuxt.options.rootDir,
});

/**
 * Where the backend URL came from, so the runtime knows whether the c15t
 * variable may replace it on a running server.
 */
type ProjectUrlSource = 'option' | 'env' | 'legacy-env' | 'none';

/**
 * The variable the app reads at runtime also gives the build its backend
 * when the config sets none, or else its c15t name.
 */
const fillProjectUrlFromEnv = (
	options: ModuleOptions,
	nuxt: Nuxt
): ProjectUrlSource => {
	if (options.projectUrl !== undefined) {
		return 'option';
	}
	const found = readBuildEnvEntry([NUXT_PROJECT_URL_ENV], nuxtEnvSource(nuxt));
	if (!found) {
		return 'none';
	}
	options.projectUrl = found.value;
	return found.name === NUXT_PROJECT_URL_ENV ? 'env' : 'legacy-env';
};

/**
 * The c15t project URL variables the server applies. The public one only
 * while neither the option nor the Inth variable gave the build its URL.
 */
const legacyProjectUrlEnv = (source: ProjectUrlSource): LegacyProjectUrlEnv[] =>
	(
		[
			['public', NUXT_PROJECT_URL_ENV],
			['server', NUXT_SERVER_PROJECT_URL_ENV],
		] as const
	).flatMap(([scope, name]) => {
		const legacy = legacyEnvName(name);
		const applies =
			scope === 'server' || source === 'legacy-env' || source === 'none';
		return legacy && applies ? [{ legacy, name, scope }] : [];
	});

/**
 * The configured `routePrefix`, checked here so a bad prefix stops the build
 * and the runtime config only ever holds a checked one.
 *
 * @throws {TypeError} When the prefix is `/` or not a path.
 */
const checkRoutePrefix = function checkRoutePrefix(
	options: ModuleOptions
): string | false {
	if (options.routePrefix === false) {
		return false;
	}
	return normalizeRoutePrefix(
		'@inth/nuxt',
		options.routePrefix ?? DEFAULT_CONSENT_ROUTE_PREFIX
	);
};

/**
 * The snapshot the server reads, and the one the browser bundle holds. A
 * `snapshot` the mode names wins over the download, which happens during
 * `nuxt build` and `nuxt dev` setup for a mode that reads one
 * (`needsBuildSnapshot` in `@inth/sdk/server`). `onBuildError` decides what
 * a failed download or a missing backend URL does. `nuxt prepare` writes
 * types during dependency installation and never downloads.
 *
 * Neither snapshot travels through runtime config, where Nitro would
 * replace every `null` in it with `''` during the build. Only browser
 * resolution ships a snapshot to the browser: every other mode resolves on
 * the server or asks the backend.
 */
const resolveSnapshots = async function resolveSnapshots(
	mode: NuxtMode,
	projectUrl: string | undefined,
	onBuildError: ModuleOptions['onBuildError'],
	nuxt: Nuxt
): Promise<{
	clientSnapshot: ConsentManifest | undefined;
	serverSnapshot: ConsentManifest | undefined;
}> {
	if (mode.type !== 'manifest') {
		return { clientSnapshot: undefined, serverSnapshot: undefined };
	}
	const logger = useLogger('@inth/nuxt');
	const serverSnapshot =
		mode.snapshot ??
		(nuxt.options._prepare
			? undefined
			: await loadManifestForBuild(
					{ projectUrl },
					{
						command: nuxt.options.dev ? 'dev' : 'build',
						envNames: [NUXT_PROJECT_URL_ENV],
						envSource: nuxtEnvSource(nuxt),
						label: '@inth/nuxt',
						logger: {
							info: (message) => logger.info(message),
							warn: (message) => logger.warn(message),
						},
						mode,
						onBuildError,
					}
				));
	return {
		clientSnapshot: mode.resolve === 'browser' ? serverSnapshot : undefined,
		serverSnapshot,
	};
};

/**
 * `nuxt generate` deploys files only, so nothing answers the consent route
 * or renders per visitor: say so instead of shipping a banner that never
 * resolves.
 */
const warnStaticServerResolution = function warnStaticServerResolution(
	mode: NuxtMode,
	nuxt: Nuxt
): void {
	const { _generate: generate } = nuxt.options as { _generate?: boolean };
	if (
		(generate || nuxt.options.nitro.static) &&
		!nuxt.options._prepare &&
		mode.type === 'manifest' &&
		mode.resolve !== 'browser'
	) {
		useLogger('@inth/nuxt').warn(
			"`nuxt generate` deploys no server, so `manifest()` cannot resolve the policy there. Set `inth: { mode: manifest({ resolve: 'browser' }), routePrefix: false }`, or omit `mode` to use the hosted backend."
		);
	}
};

/**
 * The mode as the browser and the server read it from runtime config: the
 * browser's copy, by the rule `resolveServerMode` applies in every adapter,
 * and never a snapshot, which the snapshot templates carry instead.
 */
const publishedMode = function publishedMode(
	mode: NuxtMode,
	projectUrl: string | undefined
): NuxtMode {
	const browser = resolveServerMode({
		adapter: '@inth/nuxt',
		mode: mode as ConsentMode,
		projectUrl,
	}).browser.mode as NuxtMode;
	if (browser.type !== 'manifest' || !browser.snapshot) {
		return browser;
	}
	const { snapshot: _snapshot, ...rest } = browser;
	return rest;
};

/**
 * Puts the module options in the public runtime config, which the server
 * render and the browser read. Values already there win, except `mode` and
 * `routePrefix`: the build chose the consent route, the snapshots and the
 * browser code from the module's, so the server and the browser must run
 * those. The `build-options` server plugin does the same for runtime
 * variables such as `NUXT_PUBLIC_INTH_ROUTE_PREFIX`.
 */
const publishOptions = function publishOptions(
	options: Omit<ModuleOptions, 'devtools' | 'initPrefetch' | 'onBuildError'>,
	mode: NuxtMode,
	nuxt: Nuxt
): void {
	const existing = nuxt.options.runtimeConfig.public.inth as
		| Record<string, unknown>
		| undefined;
	const built: BuiltOptions = {
		mode: publishedMode(mode, options.projectUrl),
		routePrefix: options.routePrefix ?? false,
	};
	for (const name of ['mode', 'routePrefix'] as const) {
		if (
			existing?.[name] !== undefined &&
			JSON.stringify(existing[name]) !== JSON.stringify(built[name])
		) {
			useLogger('@inth/nuxt').warn(
				`\`runtimeConfig.public.inth.${name}\` is ignored: the build uses \`inth.${name}\` (${JSON.stringify(built[name])}). Set it there.`
			);
		}
	}
	const { mode: _mode, routePrefix: _routePrefix, ...rest } = existing ?? {};
	const published: Record<string, unknown> = defu(rest, options);
	published.mode = built.mode;
	published.routePrefix = built.routePrefix;
	// Untyped: an app's generated runtime config types read `routePrefix`
	// as the string it holds, while the option also takes `false`.
	const publicRuntimeConfig: Record<string, unknown> =
		nuxt.options.runtimeConfig.public;
	publicRuntimeConfig.inth = published;
};

const SNAPSHOT_MODULES = [
	['#inth/manifest-snapshot', 'The server snapshot for the consent route.'],
	[
		'#@inth/sdk/server-manifest-snapshot',
		'The server snapshot for a server render without a consent route.',
	],
	[
		'#inth/client-manifest-snapshot',
		"The snapshot for `manifest({ resolve: 'browser' })`; otherwise `undefined`.",
	],
] as const;

// Annotated explicitly: the inferred type names `NuxtModule` through
// @nuxt/schema's store path, which is not portable across installs (TS2883).
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
	defaults: () => ({
		...defaultConsentConfig,
		devtools: true,
		initPrefetch: true,
		routePrefix: DEFAULT_CONSENT_ROUTE_PREFIX,
	}),
	meta: {
		configKey: 'inth',
		name: '@inth/nuxt',
	},
	async setup({ devtools, initPrefetch, onBuildError, ...options }, nuxt) {
		const projectUrlSource = fillProjectUrlFromEnv(options, nuxt);
		// Nuxt merges module options with `defu`, which skips `null`, so a
		// `colorScheme: null` under the `inth` key would arrive unset and
		// mirror a `dark` class. Read it back: `null` leaves `inth-dark` to
		// the site.
		const configured = (nuxt.options as { inth?: Partial<InthNuxtConfig> })
			.inth;
		if (configured?.colorScheme === null) {
			options.colorScheme = null;
		}
		const resolver = createResolver(import.meta.url);
		// The Nuxt plugins, components and composables run on the Vue runtime
		// and ship in @inth/vue, under its dist/runtime/. The server routes
		// and Nitro plugins ship here, under `resolver`'s runtime/.
		const runtime = createResolver(
			dirname(createRequire(import.meta.url).resolve('@inth/vue/vite'))
		);
		// `mode` reaches the browser as JSON through the public runtime
		// config, so it must be mode data, not a transport. `nuxt prepare`
		// runs during dependency installation, where the backend variable
		// is often unset, so the backend is not checked then.
		const mode = resolveServerMode({
			adapter: '@inth/nuxt',
			backendHint: `Set ${NUXT_PROJECT_URL_ENV}, or \`inth.projectUrl\` in nuxt.config.ts.`,
			checkBackend: !nuxt.options._prepare,
			mode: options.mode,
			projectUrl: options.projectUrl,
		}).mode as NuxtMode;
		options.routePrefix = checkRoutePrefix(options);
		const routePrefix = readNuxtRoutePrefix(options);
		warnStaticServerResolution(mode, nuxt);
		const { clientSnapshot, serverSnapshot } = await resolveSnapshots(
			mode,
			options.projectUrl,
			onBuildError,
			nuxt
		);

		// Source builds ship .ts, dist builds ship .js — alias whichever exists
		// (hardcoding .ts broke every consumer of the published package).
		nuxt.options.alias['#inth/composables'] = ['index.ts', 'index.js']
			.map((file) => runtime.resolve(`./runtime/composables/${file}`))
			.find((path) => existsSync(path)) as string;

		nuxt.options.runtimeConfig.inth = defu(
			nuxt.options.runtimeConfig.inth ?? {},
			{
				// Empty, so the consent route uses the public value, which
				// `NUXT_PUBLIC_INTH_PROJECT_URL` replaces at runtime. The key
				// exists so `NUXT_INTH_PROJECT_URL` can give the route an
				// address of its own.
				projectUrl: '',
				// The `/init` script reads it: with `ssr: false` for the whole
				// app, every page is a shell.
				ssr: nuxt.options.ssr !== false,
			}
		);

		// The consent route imports the server snapshot from this virtual. In
		// runtime config, Nitro would replace every `null` in it with `''`
		// during the build, and the route would reject each policy pack.
		nuxt.options.nitro.virtual ||= {};
		nuxt.options.nitro.virtual['#inth/manifest-snapshot'] = () =>
			renderSnapshotModule(serverSnapshot);
		// A server render without a consent route resolves from the same
		// snapshot. Only the server render imports it.
		nuxt.options.alias['#@inth/sdk/server-manifest-snapshot'] = addTemplate({
			filename: 'inth-server-manifest-snapshot.mjs',
			getContents: () => renderSnapshotModule(serverSnapshot),
		}).dst;
		// The browser bundle holds a snapshot only for browser resolution.
		nuxt.options.alias['#inth/client-manifest-snapshot'] = addTemplate({
			filename: 'inth-client-manifest-snapshot.mjs',
			getContents: () => renderSnapshotModule(clientSnapshot),
		}).dst;

		publishOptions(options, mode, nuxt);

		// Transpile/inline the module runtime by directory, not just package
		// name. When the module is registered through an aliasing package
		// that re-exports `@inth/vue`, the runtime files can resolve through
		// a symlink chain whose real path carries no
		// `node_modules/@inth/vue` segment, so a name-only pattern misses them
		// and Nitro externalizes server-handler imports with broken relative
		// paths. Registering the resolved runtime directory and its real path
		// keeps every runtime file inlined regardless of how the package was
		// reached (the official module template's `transpile.push(runtimeDir)`
		// pattern, hardened for symlinked installs). The Vue runtime holds the
		// plugins and components; this package's holds the server routes.
		nuxt.options.build.transpile.push('@inth/vue');
		for (const runtimeDir of [
			runtime.resolve('./runtime'),
			resolver.resolve('./runtime'),
		]) {
			nuxt.options.build.transpile.push(runtimeDir);
			try {
				const realRuntimeDir = realpathSync(runtimeDir);
				if (realRuntimeDir !== runtimeDir) {
					nuxt.options.build.transpile.push(realRuntimeDir);
				}
			} catch {
				// The runtime directory always exists next to the module entry;
				// realpath can only fail on exotic filesystems — the resolved path
				// is already registered above.
			}
		}

		// One catch-all answers `${routePrefix}/init` and
		// `${routePrefix}/manifest` in `manifest()` mode.
		if (routePrefix !== undefined) {
			addServerHandler({
				handler: resolver.resolve('./runtime/server/consent-route'),
				route: `${routePrefix}/**`,
			});
		}

		// Type the `inth` key of `app.config.ts`. A type template reaches the
		// app's types whichever package registered the module. It imports
		// the option types from the declarations next to this file: the
		// source in this repo, `module.d.mts` once built.
		// `CustomAppConfig` types `useAppConfig()`. `AppConfigInput` types
		// `defineAppConfig()`: it extended `CustomAppConfig` until Nuxt 4.6,
		// which made them separate, so augment both.
		const optionTypes = ['nuxt-options.ts', 'module.d.mts']
			.map((file) => resolver.resolve(`./${file}`))
			.find((path) => existsSync(path));
		if (optionTypes) {
			const specifier = optionTypes
				.replace(/\.ts$/u, '')
				.replace(/\.d\.mts$/u, '.mjs');
			addTypeTemplate(
				{
					filename: 'types/inth-app-config.d.ts',
					getContents: () =>
						[
							`import type { InthNuxtAppConfig } from ${JSON.stringify(specifier)};`,
							'',
							"declare module '@nuxt/schema' {",
							'\tinterface CustomAppConfig {',
							'\t\t/** Inth options, merged over the `inth` module options. */',
							'\t\tinth?: Partial<InthNuxtAppConfig>;',
							'\t}',
							'\tinterface AppConfigInput {',
							'\t\t/** Inth options, merged over the `inth` module options. */',
							'\t\tinth?: Partial<InthNuxtAppConfig>;',
							'\t}',
							'}',
							'',
							'export {};',
							'',
						].join('\n'),
				},
				{ nitro: true, nuxt: true }
			);
			// Nitro's typed routes import the consent route, and with it the
			// snapshot virtual. The plugin imports the client snapshot.
			addTypeTemplate(
				{
					filename: 'types/inth-manifest-snapshot.d.ts',
					getContents: () =>
						SNAPSHOT_MODULES.flatMap(([id, description]) => [
							`declare module '${id}' {`,
							"\timport type { ConsentManifest } from '@inth/sdk/schema/types';",
							'',
							`\t/** ${description} */`,
							'\tconst manifest: ConsentManifest | undefined;',
							'\texport default manifest;',
							'}',
							'',
						]).join('\n'),
				},
				{ nitro: true, nuxt: true }
			);
		}

		// Type the `inth` key of a route rule, in `nuxt.config.ts` (node), in
		// pages (`defineRouteRules`) and in Nitro.
		addTypeTemplate(
			{
				filename: 'types/inth-route-rules.d.ts',
				getContents: () =>
					[
						"declare module 'nitropack/types' {",
						'\tinterface NitroRouteConfig {',
						'\t\t/** Inth options for the routes this rule matches. */',
						'\t\tinth?: {',
						'\t\t\t/**',
						'\t\t\t * `false` writes no early `/init` script into the HTML of an',
						'\t\t\t * `ssr: false` route.',
						'\t\t\t */',
						'\t\t\tinitPrefetch?: boolean;',
						'\t\t};',
						'\t}',
						'}',
						'',
						'export {};',
						'',
					].join('\n'),
			},
			{ nitro: true, node: true, nuxt: true }
		);

		addPlugin(runtime.resolve('./runtime/plugin.nuxt'));
		// The build chose the route, the snapshots and the browser code from
		// `mode` and `routePrefix`; a runtime override such as
		// `NUXT_PUBLIC_INTH_ROUTE_PREFIX` would make the browser disagree.
		const built: BuiltOptions = {
			mode: publishedMode(mode, options.projectUrl),
			routePrefix: options.routePrefix ?? false,
		};
		nuxt.options.nitro.virtual['#@inth/sdk/build-options'] = () =>
			`export default ${JSON.stringify(built)};\n`;
		addServerPlugin(resolver.resolve('./runtime/server/build-options.nuxt'));
		// The stock banner's own files, from the client manifest
		// (`build:manifest` below runs before Nitro builds). The plugin
		// preloads them at low priority.
		let bannerFiles: string[] = [];
		nuxt.options.nitro.virtual['#inth/banner-preload-files'] = () =>
			`export default ${JSON.stringify(bannerFiles)};\n`;
		addServerPlugin(
			runtime.resolve('./runtime/server/banner-preload-priority.nuxt')
		);
		// Nuxt applies the Inth variables on a running server by itself.
		const legacyEnv = legacyProjectUrlEnv(projectUrlSource);
		nuxt.options.nitro.virtual['#inth/legacy-project-url-env'] = () =>
			`export default ${JSON.stringify(legacyEnv)};\n`;
		addServerPlugin(
			resolver.resolve('./runtime/server/legacy-project-url.nuxt')
		);
		if (initPrefetch !== false) {
			// Starts `/init` from the HTML of `ssr: false` pages, before the
			// app's JavaScript loads.
			addServerPlugin(resolver.resolve('./runtime/server/init-prefetch.nuxt'));
			// The plugin reads `app.config.ts` through this virtual, not
			// `#imports`, which Nuxt 5 stops providing to server code. Nuxt 4
			// builds the merged config as `#internal/nuxt/app-config`; Nuxt 3
			// passes the files to Nitro, whose own `useAppConfig` reads them.
			// Without Nitro auto-imports, `app.config.ts` cannot load on the
			// server (its `defineAppConfig` is an auto-import), so the plugin
			// gets no config and leaves `/init` to the browser.
			nuxt.hook('nitro:config', (nitroConfig) => {
				let source =
					"export { useAppConfig as useServerAppConfig } from 'nitropack/runtime';";
				if (nitroConfig.imports === false) {
					source = 'export const useServerAppConfig = () => undefined;';
				} else if (nitroConfig.virtual?.['#internal/nuxt/app-config']) {
					source = [
						"import appConfig from '#internal/nuxt/app-config';",
						'export const useServerAppConfig = () => appConfig;',
					].join('\n');
				}
				nitroConfig.virtual ||= {};
				nitroConfig.virtual['#@inth/sdk/server-app-config'] = source;
			});
		}
		// Which stylesheets each CSS file of the client build holds; the
		// manifest below only names the files.
		const styleSources: StyleSourceIndex = new Map();
		addVitePlugin(() => collectStyleSources(styleSources), {
			dev: false,
			server: false,
		});
		// A Customize tap before the engine fetches the dialog in a few files.
		// The plugin is typed structurally to fit every Vite version; this
		// Nuxt's own Vite types ask for their `Plugin`.
		addVitePlugin(() => createDialogChunkPlugin() as unknown as VitePlugin, {
			dev: false,
			server: false,
		});
		// One chunk for the Inth code the first load runs, not one request
		// per module the consent engine shares with it. These groups come
		// from the `config` hook, so they precede the dialog group above,
		// which `outputOptions` appends: a module both match stays in the
		// first-load or `inth-config` chunk.
		addVitePlugin(
			() => groupConsentChunks(consentPackageDirs(import.meta.url)),
			{
				dev: false,
				server: false,
			}
		);

		// Inth loads what a page needs when it needs it; Nuxt would prefetch
		// every lazy Inth chunk on every page, and each finished download
		// queues main-thread work in front of the banner. Nuxt would also
		// link Inth stylesheets it already inlines into the HTML, and each
		// link holds back the first paint: they become preloads.
		// IAB chunks keep their hints only when the module options turn IAB
		// on. `app.config.ts` can turn it on too, but the build cannot read
		// it; the CMP then loads on demand, without a hint.
		const iab = isIABConfigured(options.iab);
		// Browser resolution loads the resolver as the app starts.
		const browserResolve =
			mode.type === 'manifest' && mode.resolve === 'browser';
		nuxt.hook('build:manifest', (manifest) => {
			breakEntryImportCycles(manifest);
			const isConsentFile = createPackageCheck();
			stopPrefetchingConsentChunks(
				manifest,
				nuxt.options.srcDir,
				isConsentFile,
				{ browserResolve, iab }
			);
			preloadInlinedConsentStyles(
				manifest,
				styleSources,
				nuxt.options.features.inlineStyles,
				isConsentFile
			);
			// The banner comes with the consent engine, whose preload the
			// server decides per visitor (`runtime/plugin.nuxt.ts`).
			preloadDeferredEngine(
				manifest,
				nuxt.options.srcDir,
				isConsentFile,
				nuxt.options.ssr !== false
			);
			if (browserResolve) {
				preloadBrowserResolver(manifest, nuxt.options.srcDir, isConsentFile);
			}
			// Last: every entry import is in place, so a chunk the entry
			// shares keeps its priority.
			bannerFiles = bannerOnlyFiles(
				manifest,
				nuxt.options.srcDir,
				isConsentFile,
				{ browserResolve, iab }
			);
		});

		if (nuxt.options.dev && devtools && isNuxtDevToolsEnabled(nuxt)) {
			addDevToolsTab(nuxt, (path) => runtime.resolve(path));
		}

		for (const [name, file] of GLOBAL_COMPONENTS) {
			addComponent({
				filePath: runtime.resolve(`./runtime/components/${file}.vue`),
				global: true,
				name,
			});
		}

		// Auto-import every composable the index exports. A single resolvable
		// `from` avoids unimport's per-file registry quirks (names registered
		// from per-file paths were silently dropped — see the
		// internals/fixtures/nuxt regression: useHasConsent undefined at
		// runtime).
		const composablesEntry = ['index.ts', 'index.js']
			.map((file) => runtime.resolve(`./runtime/composables/${file}`))
			.find((path) => existsSync(path)) as string;
		addImports(
			readComposableExports(composablesEntry).map((name) => ({
				from: composablesEntry,
				name,
			}))
		);
	},
});

export default module;
