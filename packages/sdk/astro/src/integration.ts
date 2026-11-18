/**
 * The `inth()` Astro integration.
 *
 * It wires these into an Astro app:
 *
 * 1. A `pre`-order middleware that resolves consent for every request into
 *    `Astro.locals.inth`, and the `App.Locals` type for it.
 * 2. A page-level boot script that starts the one consent client the page
 *    shares — Astro islands never share a component tree, so the client is
 *    a page singleton rather than a provider. The consent engine behind it
 *    is a virtual module (`virtual:inth/engine`) the client imports when
 *    it needs it.
 * 3. In `manifest()` mode, one catch-all route under `routePrefix` that
 *    answers `init` and `manifest`, with the same semantics as the Next.js
 *    consent route.
 * 4. A virtual module (`virtual:inth/options`) carrying the serialized
 *    options to all of the above.
 * 5. The component stylesheet, on every page.
 */

import { readBuildEnv } from '@inth/sdk/build';
import type { BuildEnvSource } from '@inth/sdk/build';
import type { ConsentMode } from '@inth/sdk/modes';
import { isIABConfigured } from '@inth/sdk/runtime';
import {
	DEFAULT_CONSENT_ROUTE_PREFIX,
	normalizeRoutePrefix,
	resolveServerMode,
} from '@inth/sdk/server';
import type { AstroIntegration } from 'astro';

import { createClassMapPlugin } from './libs/class-map-plugin';
import type {
	InthAstroOptions,
	InthMiddlewareOptions,
	InthResolvedOptions,
	InthUIAdapterName,
} from './types';

const VIRTUAL_ID = 'virtual:inth/options';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
const ENGINE_ID = 'virtual:inth/engine';
const RESOLVED_ENGINE_ID = `\0${ENGINE_ID}`;

/** The variable the top-level `projectUrl` defaults to. */
const PROJECT_URL_ENV = 'PUBLIC_INTH_PROJECT_URL';

/** Files tried, in order, when `clientEntrypoint` is unset. */
const CLIENT_ENTRYPOINT_CANDIDATES = [
	'src/inth.client.ts',
	'src/inth.client.js',
	'src/inth.client.mjs',
];

/** Maps an `@inth/astro/...` specifier to what Astro should load. */
export type EntryResolver = (specifier: string) => string;

/**
 * Create a resolver for this package's own entry points.
 *
 * Astro and Vite resolve what the integration hands them from the site's
 * root. Under a strict package manager such as pnpm, a site sees only its
 * direct dependencies, not `@inth/sdk`, which this package depends on, so a
 * bare specifier would fail to resolve. A file path always does. `createRequire` resolves the package's own exports on every Node
 * version Astro supports. It is loaded here, from the async setup hook,
 * rather than imported at the top: the package root re-exports the
 * integration, and browser code importing it must not pull in a Node
 * built-in. A specifier that cannot be resolved is kept as it is.
 *
 * @returns The resolver.
 */
export const createOwnEntryResolver =
	async function createOwnEntryResolver(): Promise<EntryResolver> {
		try {
			const { createRequire } = await import('node:module');
			const require = createRequire(import.meta.url);
			return (specifier) => {
				try {
					return require.resolve(specifier);
				} catch {
					return specifier;
				}
			};
		} catch {
			return (specifier) => specifier;
		}
	};

/** The dialog and preference-widget rules, which no first paint needs. */
const DIALOG_STYLESHEET = '@inth/sdk/ui/styles/sheets/dialog.css';
const IAB_DIALOG_STYLESHEET = '@inth/sdk/ui/styles/sheets/iab-dialog.css';

/**
 * What each `ui` adapter needs from the app, keyed by adapter name.
 *
 * `astroIntegration` is checked at `astro:config:done`; `packages` is only
 * ever printed, so the error names everything to install in one go rather
 * than one failed build per missing package.
 */
const UI_ADAPTERS: Record<
	InthUIAdapterName,
	{
		astroIntegration: string;
		packages: string[];
		adapterModule: string;
		adapterExport: string;
		surfaceModule: string;
		/**
		 * The stylesheets the island's dialog needs beyond the first-paint
		 * rules the page inlines. The client links them when the dialog
		 * opens.
		 */
		dialogStyles: string[];
	}
> = {
	react: {
		adapterExport: 'reactDialogAdapter',
		adapterModule: '@inth/astro/ui/react',
		astroIntegration: '@astrojs/react',
		dialogStyles: [DIALOG_STYLESHEET],
		packages: ['@astrojs/react', '@inth/react', 'react', 'react-dom'],
		surfaceModule: '@inth/astro/islands/panel-surface.tsx',
	},
	svelte: {
		adapterExport: 'svelteDialogAdapter',
		adapterModule: '@inth/astro/ui/svelte',
		astroIntegration: '@astrojs/svelte',
		// The Svelte components also read the `@inth/sdk/ui/styles/primitives`
		// class maps, whose rules live in their own stylesheet.
		dialogStyles: [DIALOG_STYLESHEET, '@inth/sdk/ui/styles/primitives.css'],
		packages: ['@astrojs/svelte', 'svelte'],
		surfaceModule: '@inth/astro/islands/panel-surface.svelte',
	},
	vue: {
		adapterExport: 'vueDialogAdapter',
		adapterModule: '@inth/astro/ui/vue',
		astroIntegration: '@astrojs/vue',
		dialogStyles: [DIALOG_STYLESHEET],
		packages: ['@astrojs/vue', '@inth/vue', 'vue'],
		surfaceModule: '@inth/astro/islands/panel-surface.vue',
	},
};

/** Every supported `ui` value, for the error a bad one produces. */
const UI_ADAPTER_NAMES = Object.keys(UI_ADAPTERS) as InthUIAdapterName[];

/**
 * The `ui` adapter for a site that did not set one: the framework of the
 * one Astro UI integration it registers, so the dialog reuses a runtime
 * the site already loads. With none or several, Svelte, the smallest.
 *
 * @param installed - Names of the integrations the site registers.
 * @internal
 */
export const inferUIAdapter = function inferUIAdapter(
	installed: Iterable<string>
): InthUIAdapterName {
	const names = new Set(installed);
	const registered = UI_ADAPTER_NAMES.filter((name) =>
		names.has(UI_ADAPTERS[name].astroIntegration)
	);
	return registered.length === 1 && registered[0] ? registered[0] : 'svelte';
};

const resolveMiddleware = function resolveMiddleware(
	options: InthAstroOptions
): InthResolvedOptions['middleware'] {
	const raw: InthMiddlewareOptions =
		typeof options.middleware === 'boolean'
			? { enabled: options.middleware }
			: (options.middleware ?? {});
	const resolved: InthResolvedOptions['middleware'] = {
		enabled: raw.enabled ?? true,
		skip: raw.skip ?? [],
	};
	if (raw.timeoutMs !== undefined) {
		resolved.timeoutMs = raw.timeoutMs;
	}
	return resolved;
};

/**
 * The injected route's prefix, without a trailing slash.
 *
 * @param routePrefix - The configured `routePrefix`.
 * @returns The prefix, or `undefined` for `routePrefix: false`.
 * @throws {TypeError} When the prefix is not a root-relative path, or is
 * `/`: a catch-all route at the site root would catch every page.
 */
const resolveRoutePrefix = function resolveRoutePrefix(
	routePrefix: InthAstroOptions['routePrefix']
): string | undefined {
	if (routePrefix === false) {
		return undefined;
	}
	return normalizeRoutePrefix(
		'@inth/astro',
		routePrefix ?? DEFAULT_CONSENT_ROUTE_PREFIX
	);
};

/**
 * Check the mode is plain data from `manifest()`, `hosted()` or
 * `testing()`, and that it has a backend to talk to: the browser saves
 * consent at `${projectUrl}/subjects`, and the injected route answers `GET`
 * only, whatever `routePrefix` is.
 *
 * @param mode - The configured mode, or `undefined` for the default.
 * @param projectUrl - The resolved top-level backend URL.
 * @throws {TypeError} When the mode is not mode data, or has nowhere to go.
 */
const resolveMode = function resolveMode(
	mode: InthAstroOptions['mode'],
	projectUrl: string | undefined
): ConsentMode {
	return resolveServerMode({
		adapter: '@inth/astro',
		backendHint: `Set ${PROJECT_URL_ENV} in .env, or pass \`projectUrl\` to inth().`,
		checkBackend: true,
		mode,
		projectUrl,
	}).mode;
};

/**
 * Find a function in options that are serialized into the page, where it
 * would silently disappear.
 *
 * @param value - The value to search.
 * @param path - Where `value` sits in the options, for the error.
 * @param seen - Objects already searched, so a cycle ends.
 * @returns The path of the first function, or `undefined`.
 */
const findFunction = function findFunction(
	value: unknown,
	path: string,
	seen: Set<unknown>
): string | undefined {
	if (typeof value === 'function') {
		return path;
	}
	if (typeof value !== 'object' || value === null || seen.has(value)) {
		return undefined;
	}
	seen.add(value);
	const entries = Array.isArray(value)
		? value.map((item, index) => [`${path}[${index}]`, item] as const)
		: Object.entries(value).map(
				([key, item]) => [`${path}.${key}`, item] as const
			);
	for (const [childPath, item] of entries) {
		const found = findFunction(item, childPath, seen);
		if (found) {
			return found;
		}
	}
	return undefined;
};

/**
 * Throw when an option the integration serializes holds a function.
 *
 * `JSON.stringify` drops functions without a word, so a `posthog()` helper
 * in `scripts` would lose its `onBeforeLoad` and an `onRequestBlocked`
 * would never run.
 *
 * @param options - The options passed to `inth()`.
 * @throws {Error} Naming the first function found and where it belongs.
 */
const assertSerializable = function assertSerializable(
	options: InthAstroOptions
): void {
	const { mode: _mode, ...serialized } = options;
	const found = findFunction(serialized, 'inth()', new Set());
	if (found) {
		throw new Error(
			`@inth/astro: ${found} is a function. inth() options are serialized into the page as JSON, which drops functions. Move it to src/inth.client.ts, whose default export (an InthClientOptionsExtension) can hold scripts with callbacks, \`callbacks\` and \`networkBlocker.onRequestBlocked\`.`
		);
	}
};

/**
 * Normalize user options into the serializable shape every consumer reads.
 *
 * @param options - The options passed to `inth()`, with `projectUrl`
 * already defaulted from the environment.
 * @returns Options with defaults applied.
 * @throws {Error} When an option holds a function, `mode` is not mode data
 * or has no backend to talk to, `ui` or `routePrefix` is invalid, or
 * `experiment` has neither an `arm` nor a site-composed middleware to
 * resolve one.
 */
export const resolveOptions = function resolveOptions(
	options: InthAstroOptions = {}
): InthResolvedOptions {
	assertSerializable(options);
	const mode = resolveMode(options.mode, options.projectUrl);
	// A JavaScript `astro.config.mjs` has no type checking, so `ui: 'solid'`
	// reaches `buildBootScript()` and throws a bare `TypeError` on an
	// undefined adapter entry. Name the supported values instead.
	if (options.ui !== undefined && !Object.hasOwn(UI_ADAPTERS, options.ui)) {
		throw new Error(
			`@inth/astro: unknown \`ui\` ${JSON.stringify(options.ui)}. Supported adapters: ${UI_ADAPTER_NAMES.join(', ')}.`
		);
	}
	// The banner is server-rendered HTML that the browser only shows or
	// hides, so the arm has to be known on the server: a static `arm`,
	// or `experimentArm` on a middleware the site composes itself.
	if (
		options.experiment &&
		typeof options.experiment.arm !== 'string' &&
		options.middleware !== false &&
		(typeof options.middleware !== 'object' ||
			options.middleware.enabled !== false)
	) {
		throw new Error(
			'@inth/astro: `experiment` needs an arm resolved on the server. ' +
				'Set `middleware: false` and export `consentMiddleware({ experimentArm })` ' +
				'from src/middleware.ts to pick one per request, or pass a fixed `experiment.arm`.'
		);
	}
	const {
		middleware: _middleware,
		requireUIIntegration: _requireUIIntegration,
		routePrefix,
		...rest
	} = options;
	const resolved: InthResolvedOptions = {
		...rest,
		// `null` is the other adapters' spelling of `'none'`. The default is
		// `'system'`, not React's `.dark` mirroring: the banner is server
		// HTML painted before any site script runs, and an Astro site has no
		// shared `.dark` convention to mirror, so following the OS is the
		// only scheme the pre-paint script can get right.
		colorScheme:
			options.colorScheme === null ? 'none' : (options.colorScheme ?? 'system'),
		inlineStyles: options.styles !== false,
		middleware: resolveMiddleware(options),
		mode,
		ui: options.ui ?? 'svelte',
	};
	const prefix = resolveRoutePrefix(routePrefix);
	if (prefix !== undefined) {
		resolved.routePrefix = prefix;
	}
	return resolved;
};

/**
 * The options the browser receives: everything but what only the server
 * and the build read, and the mode as core's `resolveServerMode` gives it
 * to the browser. Every byte here is in each page's
 * boot chunk.
 *
 * @returns The browser's copy.
 * @internal
 */
export const toClientOptions = function toClientOptions(
	resolved: InthResolvedOptions
): Partial<InthResolvedOptions> {
	// `inlineStyles` stays: the engine adds the first-paint rules a page
	// left out when the dialog opens.
	const {
		clientEntrypoint: _clientEntrypoint,
		middleware: _middleware,
		onBuildError: _onBuildError,
		styles: _styles,
		...client
	} = resolved;
	client.mode = resolveServerMode({
		adapter: '@inth/astro',
		mode: client.mode,
	}).browser.mode;
	if (client.mode.type !== 'manifest') {
		// Only `manifest()` calls the injected route.
		delete client.routePrefix;
	}
	return client;
};

/**
 * Where the `clientEntrypoint` module is.
 *
 * A path starting with `.` resolves from the project root; an absolute path
 * or a package specifier is used as it is. Unset, the first of
 * `src/inth.client.ts`, `.js` and `.mjs` that exists.
 *
 * @param configured - The configured `clientEntrypoint`.
 * @param root - The Astro project root.
 * @returns The specifier the boot script imports, or `undefined`.
 * @throws {Error} When a configured relative path does not exist.
 * @internal
 */
export const resolveClientEntrypoint = async function resolveClientEntrypoint(
	configured: string | undefined,
	root: URL | undefined
): Promise<string | undefined> {
	const { existsSync } = await import('node:fs');
	const { fileURLToPath } = await import('node:url');
	const rootURL = root ?? new URL(`file://${process.cwd()}/`);
	const fromRoot = (path: string): string =>
		fileURLToPath(new URL(path, rootURL));
	if (configured === undefined) {
		return CLIENT_ENTRYPOINT_CANDIDATES.map(fromRoot).find((path) =>
			existsSync(path)
		);
	}
	if (!configured.startsWith('.')) {
		return configured;
	}
	const path = fromRoot(configured);
	if (!existsSync(path)) {
		throw new Error(
			`@inth/astro: clientEntrypoint ${JSON.stringify(configured)} resolves to ${path}, which does not exist. Relative paths start from the project root.`
		);
	}
	return path;
};

/**
 * Whether the site at `root` builds its CSS with Tailwind CSS 3.
 *
 * @param root - The Astro project root.
 * @returns Resolves `true` when `tailwindcss` resolves from the root at
 * major 3.
 * @internal
 */
export const usesTailwind3 = async function usesTailwind3(
	root: URL | undefined
): Promise<boolean> {
	if (!root) {
		return false;
	}
	try {
		// Dynamic, like `createOwnEntryResolver`: browser code may import the
		// package root, and `node:module` has no browser build.
		const { createRequire } = await import('node:module');
		const require = createRequire(new URL('package.json', root));
		const { version } = require('tailwindcss/package.json') as {
			version?: string;
		};
		return version?.startsWith('3.') === true;
	} catch {
		return false;
	}
};

/** The one field every plugin this integration adds has in common. */
interface VitePluginLike {
	name: string;
}

/** Minimal Vite plugin shape, so the package does not depend on Vite types. */
interface VirtualOptionsPlugin extends VitePluginLike {
	name: string;
	resolveId: (id: string) => string | undefined;
	load: (id: string, options?: { ssr?: boolean }) => string | undefined;
}

const createVirtualOptionsPlugin = function createVirtualOptionsPlugin(
	resolved: InthResolvedOptions
): VirtualOptionsPlugin {
	const serialized = JSON.stringify(resolved);
	const serializedClient = JSON.stringify(toClientOptions(resolved));
	return {
		load(id, options) {
			if (id !== RESOLVED_VIRTUAL_ID) {
				return undefined;
			}
			// The browser initializes through /init. Only server middleware
			// and routes need the snapshot, policy packs and the translation
			// catalogue.
			return `export default ${options?.ssr ? serialized : serializedClient};`;
		},
		name: 'inth:options',
		resolveId(id: string) {
			return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : undefined;
		},
	};
};

/**
 * Serves `virtual:inth/engine`, the module the page's client imports to
 * load the consent engine (see {@link buildBootScript}).
 *
 * @param source - The module's source.
 */
const createVirtualEnginePlugin = function createVirtualEnginePlugin(
	source: string
): VirtualOptionsPlugin {
	return {
		load(id) {
			return id === RESOLVED_ENGINE_ID ? source : undefined;
		},
		name: 'inth:engine',
		resolveId(id: string) {
			return id === ENGINE_ID ? RESOLVED_ENGINE_ID : undefined;
		},
	};
};

/** A runtime module factory the engine module imports and registers. */
interface PageRuntimeModule {
	/** The `ConsentRuntimeModules` key it fills. */
	name: 'connectConsentSource' | 'createNetworkBlocker' | 'createScriptLoader';
	/** The export to import, when it differs from `name`. */
	exportName?: string;
	specifier: string;
}

/**
 * The runtime modules this site's pages mount, which the engine module
 * imports and registers.
 *
 * The client mounts none of the script loader, the network blocker and a
 * `consentSource` connection by itself, so a site that configures none of
 * them never downloads them. A site that does gets them in the engine's
 * chunk: loaded on demand, each would arrive only after the engine ran,
 * and for a returning visitor consented scripts and held requests would
 * wait one more round trip. None of them is in the page's first load: the
 * first-load shell starts the plain scripts a banner choice allows itself,
 * and loads the engine at once when a script may run before any choice. A
 * `clientEntrypoint` may add scripts or a `consentSource` the build cannot
 * see, so it keeps both, and it may add blocker rules, so it gets the
 * on-demand blocker when the site configures none.
 *
 * The engine module imports each on-demand factory on its own: an
 * `import()` of the statically imported script loader anywhere in the
 * page's graph would keep it in a chunk of its own.
 *
 * @returns The factories to import and register.
 */
const pageRuntimeModules = function pageRuntimeModules(
	resolved: InthResolvedOptions
): PageRuntimeModule[] {
	const modules: PageRuntimeModule[] = [];
	if ((resolved.scripts?.length ?? 0) > 0 || resolved.clientEntrypoint) {
		modules.push({
			name: 'createScriptLoader',
			specifier: '@inth/sdk/modules/script-loader',
		});
	}
	if (resolved.networkBlocker) {
		modules.push({
			name: 'createNetworkBlocker',
			specifier: '@inth/sdk/modules/network-blocker',
		});
	} else if (resolved.clientEntrypoint) {
		modules.push({
			exportName: 'networkBlockerOnDemand',
			name: 'createNetworkBlocker',
			specifier: '@inth/sdk/runtime/on-demand-factories',
		});
	}
	if (resolved.clientEntrypoint) {
		modules.push({
			name: 'connectConsentSource',
			specifier: '@inth/sdk/runtime/controls',
		});
	}
	return modules;
};

/**
 * The transport export of `@inth/astro/client` the page registers, so it
 * ships only the code its mode runs.
 *
 * - `testing()` loads its transport on the first init.
 * - `hosted()` on a site with no adapter: every page is prerendered and
 *   every first visit inits, so the whole hosted transport ships with it.
 * - Otherwise the server resolved the visitor, so only the save path ships
 *   and the init path loads when a page inits again.
 *
 * @param hasAdapter - Whether the site has a server adapter.
 * @returns The export name.
 */
const transportExport = function transportExport(
	resolved: InthResolvedOptions,
	hasAdapter: boolean
): 'hostedTransport' | 'lazyTransport' | 'testingTransport' {
	if (resolved.mode.type === 'testing') {
		return 'testingTransport';
	}
	if (resolved.mode.type === 'hosted' && !hasAdapter) {
		return 'hostedTransport';
	}
	return 'lazyTransport';
};

/** The two modules {@link buildBootScript} writes. */
export interface BootScripts {
	/** The page script, injected at the `page` stage: the first load. */
	page: string;
	/** `virtual:inth/engine`, which the page's client imports. */
	engine: string;
}

/**
 * Build the page script the integration injects, and the engine module it
 * loads.
 *
 * The page script is the first load: the options, the dialog loaders and
 * the first-load shell (`startDeferredClient`), which reads the snapshot
 * the server rendered the banner from, answers the delegated listener and
 * records a banner choice before the engine loads. The engine (the
 * runtime, its transport, persistence and the runtime modules) is
 * `virtual:inth/engine`, behind `import()`.
 *
 * The adapter and island specifiers are written here, not in `adapter.ts`
 * or the `.astro` components, because this is the one place that knows
 * `ui` before the app's bundler runs. A static reference to all three
 * would make a Svelte-only site's build resolve `@inth/react` and `vue`.
 * Both specifiers stay behind `import()`, so nothing loads until someone
 * opens a dialog. They are registered in the page script so that a tap on
 * Customize starts the adapter, the island and the engine together.
 *
 * @param resolveEntry - Maps this package's specifiers to what Astro loads.
 * @param hasAdapter - Whether the site has a server adapter.
 * @returns The page script and the engine module.
 */
export const buildBootScript = function buildBootScript(
	resolved: InthResolvedOptions,
	resolveEntry: EntryResolver,
	hasAdapter = false
): BootScripts {
	const { ui } = resolved;
	const adapter = UI_ADAPTERS[ui];
	const serializedUI = JSON.stringify(ui);
	const quote = (specifier: string): string =>
		JSON.stringify(resolveEntry(specifier));
	const client = quote('@inth/astro/client');
	const page = [
		`import options from '${VIRTUAL_ID}';`,
		`import { registerDialogAdapter, registerDialogStyles, registerDialogSurface, startDeferredClient } from ${client};`,
		`registerDialogAdapter(${serializedUI}, async () => (await import(${quote(adapter.adapterModule)})).${adapter.adapterExport});`,
		`registerDialogSurface(${serializedUI}, () => import(${quote(adapter.surfaceModule)}));`,
	];
	// `?url` makes each stylesheet an emitted file and the import a string,
	// so none of its rules reach the page until the client links it. Pages
	// that link `styles.css` already have the dialog's rules.
	const dialogStyles = resolved.inlineStyles
		? adapter.dialogStyles
		: adapter.dialogStyles.filter(
				(specifier) => specifier !== DIALOG_STYLESHEET
			);
	if (resolved.styles !== false && dialogStyles.length > 0) {
		const names = dialogStyles.map((_, index) => `dialogStyle${index}`);
		dialogStyles.forEach((specifier, index) => {
			page.push(
				`import ${names[index]} from ${JSON.stringify(`${resolveEntry(specifier)}?url`)};`
			);
		});
		page.push(`registerDialogStyles([${names.join(', ')}]);`);
	}
	if (resolved.inlineStyles && isIABConfigured(resolved.iab)) {
		page.push(
			`import iabDialogStyle from ${JSON.stringify(`${resolveEntry(IAB_DIALOG_STYLESHEET)}?url`)};`,
			"registerDialogStyles([iabDialogStyle], 'iab');"
		);
	}
	const loadEngine = `() => import('${ENGINE_ID}')`;
	if (resolved.clientEntrypoint) {
		page.push(
			`import clientOptions from ${JSON.stringify(resolved.clientEntrypoint)};`,
			`startDeferredClient(options, ${loadEngine}, clientOptions);`
		);
	} else {
		page.push(`startDeferredClient(options, ${loadEngine});`);
	}

	const transport = transportExport(resolved, hasAdapter);
	const engine = [
		`import { boot, registerTransport, ${transport} } from ${client};`,
		`registerTransport(${transport});`,
	];
	const runtimeModules = pageRuntimeModules(resolved);
	if (runtimeModules.length > 0) {
		engine.push(`import { registerRuntimeModules } from ${client};`);
		for (const { exportName, name, specifier } of runtimeModules) {
			const binding = exportName ? `${exportName} as ${name}` : name;
			engine.push(`import { ${binding} } from ${quote(specifier)};`);
		}
		engine.push(
			`registerRuntimeModules({ ${runtimeModules.map(({ name }) => name).join(', ')} });`
		);
	}
	// Only a site that sets `iab` ships the CMP mount and the lazy factory,
	// and `@inth/sdk/iab` itself stays behind the factory's `import()`.
	if (isIABConfigured(resolved.iab)) {
		engine.push(
			`import { registerIAB } from ${client};`,
			`import { createLazyIABFactory } from ${quote('@inth/sdk/runtime')};`,
			`import { mountRuntimeIAB } from ${quote('@inth/sdk/runtime/on-demand')};`,
			`registerIAB({ ...createLazyIABFactory(() => import(${quote('@inth/sdk/iab')})), mount: mountRuntimeIAB });`
		);
	}
	engine.push('export { boot };');
	return { engine: engine.join('\n'), page: page.join('\n') };
};

/**
 * Build the stylesheet imports for a Tailwind 3 site, where the host must
 * process the base and optional IAB rules instead of inlining them.
 *
 * @param resolveEntry - Maps this package's specifiers to what Astro loads.
 * @returns The module source, or an empty string when there is nothing to
 * add or with `styles: false`.
 */
export const buildStylesImport = function buildStylesImport(
	resolved: InthResolvedOptions,
	resolveEntry: EntryResolver
): string {
	const quote = (specifier: string): string =>
		JSON.stringify(resolveEntry(specifier));
	if (resolved.styles === false) {
		return '';
	}
	// The banner's rules are inlined into the HTML with its config (see
	// `<ConsentScript />`), so no stylesheet link holds back the first
	// paint. The dialog's rules are not here either: the boot script
	// registers them and the client links them on the first open. A
	// Tailwind 3 build has to process the rules itself, so it gets the
	// whole stylesheet, linked as before.
	const lines: string[] = [];
	if (!resolved.inlineStyles) {
		lines.push(`import ${quote('@inth/astro/styles.css')};`);
	}
	if (!resolved.inlineStyles && isIABConfigured(resolved.iab)) {
		lines.push(`import ${quote('@inth/astro/iab/styles.css')};`);
	}
	return lines.join('\n');
};

/**
 * The Vite plugins the app needs for the configured `ui`.
 *
 * `@inth/vue` resolves its own runtime specifiers (`#imports`,
 * `#inth/composables`) through its package `imports`, but ships `.vue`
 * files, which Vite's dependency pre-bundling cannot load, so the `vue`
 * adapter keeps it out of pre-bundling.
 *
 * With the full stylesheet injected, the islands' own component CSS would
 * be a second copy, so their class maps resolve without it.
 *
 * @param engineSource - The `virtual:inth/engine` module from
 * {@link buildBootScript}. Without it the module is not served.
 * @returns Vite plugins to merge into the app config.
 */
export const buildVitePlugins = function buildVitePlugins(
	resolved: InthResolvedOptions,
	engineSource?: string
): VitePluginLike[] {
	const plugins: VitePluginLike[] = [createVirtualOptionsPlugin(resolved)];
	if (engineSource !== undefined) {
		plugins.push(createVirtualEnginePlugin(engineSource));
	}
	if (resolved.styles !== false) {
		plugins.push(
			createClassMapPlugin({
				iabStylesInjected: isIABConfigured(resolved.iab),
			})
		);
	}
	if (resolved.ui === 'vue') {
		plugins.push({
			config: () => ({
				optimizeDeps: { exclude: ['@inth/vue'] },
			}),
			name: '@inth/vue',
		} as VitePluginLike);
	}
	return plugins;
};

/**
 * Whether `astro build` needs a server adapter for the injected route:
 * it renders on demand unless it is prerendered for browser resolution on
 * a site without one.
 */
const routeIsPrerendered = function routeIsPrerendered(
	resolved: InthResolvedOptions,
	hasAdapter: boolean
): boolean {
	return (
		!hasAdapter &&
		resolved.mode.type === 'manifest' &&
		resolved.mode.resolve === 'browser'
	);
};

/**
 * Whether the integration injects its route: in `manifest()` mode, unless
 * `routePrefix: false`. Hosted and testing pages never call it.
 */
const injectsRoute = function injectsRoute(
	resolved: InthResolvedOptions
): resolved is InthResolvedOptions & { routePrefix: string } {
	return (
		resolved.routePrefix !== undefined && resolved.mode.type === 'manifest'
	);
};

/**
 * Explain why a build with the injected route needs an adapter.
 *
 * @param routePrefix - The injected route's prefix.
 */
const missingAdapterMessage = function missingAdapterMessage(
	routePrefix: string
): string {
	return `@inth/astro: manifest() resolves each visitor on the server and injects an on-demand route at ${routePrefix}/[...path], which needs a server adapter to build. For a static site, use hosted() or manifest({ resolve: 'browser' }), or set \`routePrefix: false\`.`;
};

/**
 * Fetch the manifest for `astro build` or `astro dev` and put it in the
 * resolved mode as its `snapshot`, for a mode that reads one
 * (`needsBuildSnapshot` in `@inth/sdk/server`).
 *
 * @param resolved - The resolved options; its mode gains the snapshot.
 * @param command - `build` or `dev`.
 * @param logger - Astro's integration logger.
 * @param envSource - Where `INTH_ON_BUILD_ERROR` is read.
 * @throws {Error} When the fetch fails in `'fail'` mode.
 */
const bundleBuildManifest = async function bundleBuildManifest(
	resolved: InthResolvedOptions,
	command: 'build' | 'dev',
	logger: { info: (message: string) => void; warn: (message: string) => void },
	envSource: BuildEnvSource
): Promise<void> {
	const { mode } = resolved;
	const { loadManifestForBuild } = await import('@inth/sdk/build');
	const snapshot = await loadManifestForBuild(
		{ projectUrl: resolved.projectUrl },
		{
			command,
			envNames: [PROJECT_URL_ENV],
			envSource,
			label: '@inth/astro',
			logger,
			mode,
			onBuildError: resolved.onBuildError,
		}
	);
	if (snapshot && mode.type === 'manifest') {
		// A snapshot is its own source.
		const { source: _source, ...rest } = mode;
		resolved.mode = { ...rest, snapshot };
	}
};

/**
 * The `App.Locals` declaration the integration adds to `.astro/types.d.ts`,
 * so a site types `Astro.locals.inth` without an `env.d.ts` line.
 *
 * @internal
 */
export const LOCALS_TYPES = [
	'declare namespace App {',
	'	interface Locals {',
	'		/** Consent context resolved by the Inth middleware. */',
	"		inth: import('@inth/astro').InthLocals;",
	'	}',
	'}',
	'',
].join('\n');

/**
 * Resolve the options for this site: the backend URL from the environment
 * or `.env` in the project root, the `ui` from the registered integrations,
 * and where the client entrypoint is.
 *
 * @param options - The options passed to `inth()`.
 * @param config - Astro's config, as `astro:config:setup` has it.
 * @param envSource - Where the backend URL variable is read.
 * @throws {Error} When {@link resolveOptions} or
 * {@link resolveClientEntrypoint} does.
 */
const resolveSiteOptions = async function resolveSiteOptions(
	options: InthAstroOptions,
	config: { root?: URL; integrations?: { name: string }[] } | undefined,
	envSource: BuildEnvSource
): Promise<InthResolvedOptions> {
	const root = config?.root;
	const projectUrl =
		options.projectUrl ?? readBuildEnv([PROJECT_URL_ENV], envSource);
	const site = resolveOptions(
		projectUrl === undefined ? options : { ...options, projectUrl }
	);
	if (options.ui === undefined) {
		site.ui = inferUIAdapter(
			(config?.integrations ?? []).map((integration) => integration.name)
		);
	}
	const clientEntrypoint = await resolveClientEntrypoint(
		options.clientEntrypoint,
		root
	);
	if (clientEntrypoint === undefined) {
		delete site.clientEntrypoint;
	} else {
		site.clientEntrypoint = clientEntrypoint;
	}
	return site;
};

/**
 * Create the Inth Astro integration.
 *
 * @param options - Consent configuration for the site. Everything here is
 * serialized into the page; callbacks belong in `src/inth.client.ts`.
 * @returns The Astro integration to list in `astro.config.mjs`.
 * @throws {Error} When an option holds a function, the mode has no backend
 * URL, the Astro integration for the dialog's `ui` is not listed in
 * `astro.config`, or `astro build` runs with the injected on-demand route
 * and no server adapter.
 * @example
 * ```js
 * import node from '@astrojs/node';
 * import svelte from '@astrojs/svelte';
 * import { defineConfig } from 'astro/config';
 * import Inth from '@inth/astro';
 *
 * // Reads PUBLIC_INTH_PROJECT_URL from .env.
 * export default defineConfig({
 *   adapter: node({ mode: 'standalone' }),
 *   integrations: [svelte(), inth()],
 *   output: 'server',
 * });
 * ```
 */
export const inth = function inth(
	options: InthAstroOptions = {}
): AstroIntegration {
	// Checked here as well, so a bad option fails before Astro starts.
	assertSerializable(options);
	let resolved: InthResolvedOptions | undefined;
	// Recorded at `astro:config:setup`, which runs before `astro:config:done`.
	let command: string | undefined;

	return {
		hooks: {
			'astro:config:done'({ config, injectTypes, logger }) {
				if (!resolved) {
					return;
				}
				injectTypes({
					content: LOCALS_TYPES,
					filename: 'locals.d.ts',
				});
				// Astro would stop the build on its own, with a generic
				// "no adapter" error that never mentions the route Inth added.
				// Only the build needs an adapter: `astro dev` and `astro sync`
				// accept on-demand routes without one.
				if (
					command === 'build' &&
					injectsRoute(resolved) &&
					!config.adapter &&
					!routeIsPrerendered(resolved, false)
				) {
					throw new Error(missingAdapterMessage(resolved.routePrefix));
				}

				if (options.requireUIIntegration === false) {
					return;
				}
				const installed = new Set(
					config.integrations.map((integration) => integration.name)
				);
				const adapter = UI_ADAPTERS[resolved.ui];
				if (installed.has(adapter.astroIntegration)) {
					return;
				}
				logger.error(
					`the preference-centre and IAB dialogs render as ${resolved.ui} islands, so ${adapter.astroIntegration} must be installed and listed in astro.config before inth(). Install ${adapter.packages.join(', ')} and run \`npx astro add ${resolved.ui}\`, or pass \`requireUIIntegration: false\` if you only use the server-rendered banner.`
				);
				throw new Error(
					`@inth/astro: ui: ${JSON.stringify(resolved.ui)} needs ${adapter.astroIntegration}. Install it, or set \`requireUIIntegration: false\` for a banner-only site.`
				);
			},

			async 'astro:config:setup'({
				addMiddleware,
				command: setupCommand,
				config,
				injectRoute,
				injectScript,
				logger,
				updateConfig,
			}) {
				command = setupCommand;
				const root = config?.root;
				const { fileURLToPath } = await import('node:url');
				const envSource = {
					mode: command === 'build' ? 'production' : 'development',
					root: root ? fileURLToPath(root) : process.cwd(),
				};
				const site = await resolveSiteOptions(options, config, envSource);
				resolved = site;
				if (command === 'build' || command === 'dev') {
					await bundleBuildManifest(site, command, logger, envSource);
				}
				const resolveEntry = await createOwnEntryResolver();
				// Tailwind 3 unwraps Inth's cascade layer in the stylesheets it
				// builds (`@inth/react/postcss-tailwind3`). Inlined rules skip that
				// build and would lose to its preflight.
				if (site.inlineStyles && (await usesTailwind3(root))) {
					site.inlineStyles = false;
				}

				// With Astro's own CSP on, allow the inline code the components
				// render, and hand the browser the policy's script hashes so it
				// can name the `clientEntrypoint` scripts the policy lacks.
				// Loaded here so the package root, which browser code may
				// import, does not pull in the server renderers.
				const { buildAstroCsp } = await import('./csp');
				const csp = await buildAstroCsp(config, site);
				const serialized = csp?.browser ? { ...site, csp: csp.browser } : site;
				const bootScripts = buildBootScript(
					site,
					resolveEntry,
					Boolean(config?.adapter)
				);
				updateConfig({
					vite: { plugins: buildVitePlugins(serialized, bootScripts.engine) },
				});
				if (csp) {
					updateConfig(csp.update);
				}

				if (site.middleware.enabled) {
					addMiddleware({
						entrypoint: resolveEntry('@inth/astro/middleware'),
						order: 'pre',
					});
				}

				// `page` starts the client on every page, before any island
				// hydrates, so it exists before anything asks for it.
				injectScript('page', bootScripts.page);

				// `page-ssr` is Astro's hook for page-wide CSS. The components
				// cannot import their own: the server build resolves the class
				// maps through the `node` condition, which carries no CSS.
				const styles = buildStylesImport(site, resolveEntry);
				if (styles) {
					injectScript('page-ssr', styles);
				}

				if (injectsRoute(site)) {
					injectRoute({
						entrypoint: resolveEntry('@inth/astro/api'),
						pattern: `${site.routePrefix}/[...path]`,
						prerender: routeIsPrerendered(site, Boolean(config?.adapter)),
					});
				}
			},
		},
		name: '@inth/astro',
	};
};

export default inth;
