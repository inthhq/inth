import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
	DEFERRED_SHEET_SPECIFIERS,
	GENERATED_MODULE_ID,
	readBuildEnv,
	readBuildEnvEntry,
	writeManifestCacheModule,
} from '@inth/sdk/build';
import type {
	BuildEnvSource,
	ManifestBuildOptions,
	ManifestCacheFiles,
} from '@inth/sdk/build';
import type { NextConfig } from 'next';
import {
	PHASE_DEVELOPMENT_SERVER,
	PHASE_PRODUCTION_BUILD,
} from 'next/constants.js';

import { BACKEND_URL_ENV } from './config';
import type { ConsentConfig } from './config';

export type {
	ManifestBuildErrorMode,
	ManifestBuildOptions,
} from '@inth/sdk/build';

/** A Next.js configuration object or synchronous/asynchronous factory. */
export type ConsentNextConfig =
	| NextConfig
	| ((
			phase: string,
			context: { defaultConfig: NextConfig }
	  ) => NextConfig | Promise<NextConfig>);

/**
 * The specifiers aliased to the written snapshot: `@inth/sdk/generated`,
 * which the server helpers import, and `@inth/nextjs/generated` for app
 * code. The packages' own modules there export `undefined`.
 */
const GENERATED_SPECIFIERS = ['@inth/nextjs/generated', GENERATED_MODULE_ID];

/** The specifier the package imports the app's `inth.config.ts` through. */
const USER_CONFIG_SPECIFIER = '@inth/nextjs/user-config';

/** Config files looked up at the project root, in this order. */
const USER_CONFIG_FILES = [
	'inth.config.ts',
	'inth.config.mts',
	'inth.config.js',
	'inth.config.mjs',
];

/**
 * Packages whose imports of {@link GENERATED_SPECIFIERS} and
 * {@link USER_CONFIG_SPECIFIER} must be bundled for the alias to apply. The
 * Pages Router leaves dependencies external on the server unless they are
 * transpiled.
 */
const GENERATED_IMPORTERS = ['@inth/sdk', '@inth/nextjs'];

type WebpackConfigFunction = NonNullable<NextConfig['webpack']>;

interface SheetFiles {
	/** The sheet's specifier, as `@inth/react` imports it. */
	specifier: string;
	eager: string;
	deferred: string;
}

/**
 * Each sheet module and its deferred twin as files, resolved the way
 * `@inth/react` resolves them. A sheet the installed `@inth/sdk/ui` lacks, or
 * has no deferred twin for, is left out.
 */
const resolveSheetFiles = function resolveSheetFiles(): SheetFiles[] {
	let fromReact: ReturnType<typeof createRequire>;
	try {
		// From this package: an isolated install links `@inth/react` here and
		// `@inth/sdk/ui` beside `@inth/react`, not at the project root.
		fromReact = createRequire(
			createRequire(import.meta.url).resolve('@inth/react')
		);
	} catch {
		return [];
	}
	// A server-rendered page already holds these sheets in `<style>`
	// elements, so browser bundles get each one's `-deferred` module.
	return DEFERRED_SHEET_SPECIFIERS.flatMap((specifier) => {
		try {
			return [
				{
					deferred: fromReact.resolve(`${specifier}-deferred`),
					eager: fromReact.resolve(specifier),
					specifier,
				},
			];
		} catch {
			return [];
		}
	});
};

/** The app's `inth.config.*` at the project root, or `undefined`. */
const findUserConfig = function findUserConfig(
	root: string
): string | undefined {
	for (const name of USER_CONFIG_FILES) {
		const file = join(root, name);
		if (existsSync(file)) {
			return file;
		}
	}
	return undefined;
};

/**
 * Next.js's own loader for `next.config.ts`: compiles a TypeScript file with
 * SWC, honouring the project's `tsconfig.json` paths, and evaluates it.
 * Next.js 15 names the root `cwd`, 16 names it `dir`.
 */
type TranspileConfig = (options: {
	configFileName: string;
	cwd: string;
	dir: string;
	nextConfigPath: string;
}) => Promise<unknown>;

const importConfigFile = async function importConfigFile(
	file: string,
	root: string
): Promise<unknown> {
	if (!/\.m?ts$/u.test(file)) {
		return await import(pathToFileURL(file).href);
	}
	// Next.js 15 installs TypeScript when it can't find it. Never let
	// reading the config install packages.
	createRequire(join(root, 'package.json')).resolve('typescript');
	const { transpileConfig } =
		(await import('next/dist/build/next-config-ts/transpile-config.js')) as unknown as {
			transpileConfig: TranspileConfig;
		};
	return await transpileConfig({
		configFileName: basename(file),
		cwd: root,
		dir: root,
		nextConfigPath: file,
	});
};

/**
 * The default export of the app's `inth.config.*`, evaluated with the loader
 * Next.js uses for `next.config.ts`, so the build sees the same `mode` and
 * `projectUrl` as the bundles.
 *
 * A config `defineConsentConfig` rejects stops the build with its error.
 * One that can't be evaluated here for another reason (an import Node
 * can't load, say) warns and reads as no config: the build then fetches the
 * manifest as for `manifest()`, as it did before it read the file.
 *
 * @throws {TypeError} When `defineConsentConfig` rejects the config.
 */
const loadUserConfig = async function loadUserConfig(
	file: string,
	root: string
): Promise<ConsentConfig | undefined> {
	try {
		const loaded = (await importConfigFile(file, root)) as
			| { default?: unknown }
			| undefined;
		const config = loaded?.default ?? loaded;
		return typeof config === 'object' && config !== null
			? (config as ConsentConfig)
			: undefined;
	} catch (error) {
		// Next.js wraps the evaluation error as its `cause`.
		const parts = [error, (error as { cause?: unknown } | null)?.cause].filter(
			(part) => part !== undefined
		);
		// `defineConsentConfig` rejected the config: the server render
		// would too, so stop here.
		const rejected = parts.find(
			(part) =>
				part instanceof Error && part.message.startsWith('@inth/nextjs: ')
		);
		if (rejected) {
			throw rejected;
		}
		const reason = parts
			.map((part) => (part instanceof Error ? part.message : String(part)))
			.join(': ');
		console.warn(
			`@inth/nextjs/build: could not read ${relative(root, file)} (${reason}), so the build fetches the consent manifest as for manifest().`
		);
		return undefined;
	}
};

/**
 * The URL from the c15t name of {@link BACKEND_URL_ENV} when only that is
 * set, copied to the Inth name in the process environment.
 * `inth.config.ts`, evaluated next, reads the Inth name, and the caller also
 * adds it to the config's `env`, so bundles inline it under that name.
 *
 * @returns The URL that was copied, or `undefined`.
 */
const exposeLegacyProjectUrl = function exposeLegacyProjectUrl(
	envSource: BuildEnvSource
): string | undefined {
	const found = readBuildEnvEntry([BACKEND_URL_ENV], envSource);
	if (!found || found.name === BACKEND_URL_ENV) {
		return undefined;
	}
	process.env[BACKEND_URL_ENV] = found.value;
	return found.value;
};

/** A project-relative `./` path, the form Turbopack resolves alias targets in. */
const fromProject = function fromProject(file: string): string {
	const path = relative(process.cwd(), file).split(sep).join('/');
	return path.startsWith('.') ? path : `./${path}`;
};

/**
 * Points {@link GENERATED_SPECIFIERS} at the written modules and
 * {@link USER_CONFIG_SPECIFIER} at the app's `inth.config.ts` in both
 * bundlers, keeping any aliases and `webpack` function already set, and
 * transpiles the Inth packages so Pages Router server bundles see the
 * aliases. Packages the app lists in `serverExternalPackages` stay
 * external.
 *
 * Server bundles get the snapshot. Browser bundles get the module that
 * imports `server-only`, so a client import fails the build. Turbopack
 * picks it through the `browser` condition, webpack through the client
 * compiler. Both get the same config file.
 */
const withConsentAliases = function withConsentAliases(
	config: NextConfig,
	files: ManifestCacheFiles,
	userConfigFile: string | undefined
): NextConfig {
	const external = new Set(config.serverExternalPackages);
	const transpilePackages = [
		...new Set([
			...(config.transpilePackages ?? []),
			...GENERATED_IMPORTERS.filter((name) => !external.has(name)),
		]),
	];
	const turbopackTarget = {
		browser: fromProject(files.browser),
		default: fromProject(files.server),
	};
	const turbopackAliases: Record<string, string | Record<string, string>> =
		Object.fromEntries(
			GENERATED_SPECIFIERS.map((specifier) => [specifier, turbopackTarget])
		);
	if (userConfigFile) {
		turbopackAliases[USER_CONFIG_SPECIFIER] = fromProject(userConfigFile);
	}
	const sheetFiles = resolveSheetFiles();
	for (const sheet of sheetFiles) {
		turbopackAliases[sheet.specifier] = {
			browser: fromProject(sheet.deferred),
			default: fromProject(sheet.eager),
		};
	}
	const userWebpack = config.webpack ?? undefined;
	const webpack: WebpackConfigFunction = (webpackConfig, context) => {
		const resolved = userWebpack
			? userWebpack(webpackConfig, context)
			: webpackConfig;
		const target = context.isServer ? files.server : files.browser;
		const aliases: Record<string, string> = Object.fromEntries(
			GENERATED_SPECIFIERS.map((specifier) => [`${specifier}$`, target])
		);
		if (userConfigFile) {
			aliases[`${USER_CONFIG_SPECIFIER}$`] = userConfigFile;
		}
		if (!context.isServer) {
			for (const sheet of sheetFiles) {
				aliases[`${sheet.specifier}$`] = sheet.deferred;
			}
		}
		resolved.resolve ??= {};
		resolved.resolve.alias = { ...resolved.resolve.alias, ...aliases };
		return resolved;
	};
	return {
		...config,
		transpilePackages,
		turbopack: {
			...config.turbopack,
			resolveAlias: {
				...config.turbopack?.resolveAlias,
				...turbopackAliases,
			},
		},
		webpack,
	};
};

/**
 * Finds the app's `inth.config.ts` and fetches the deployment's consent
 * manifest before Next.js builds or starts dev.
 *
 * `inth.config.ts` (or `.mts`, `.js`, `.mjs`) at the project root is
 * aliased into server and browser bundles, so `ConsentRoot`,
 * `resolveConsent()`, `createConsentRoute()` and the Pages Router helpers
 * read it without the app importing it. Its default export must be a
 * `defineConsentConfig()` result. Browser bundles include it, so it must
 * hold no secrets.
 *
 * The manifest is written to `node_modules/.cache/inth/manifest.js` and
 * handed to the server helpers. `resolveConsent` and the consent route handlers read
 * it by default. Server code that needs it reads `snapshot` from
 * `@inth/nextjs/generated` (or `@inth/sdk/generated`). Nothing is written into the
 * app's source tree. Production server startup never fetches or rewrites the
 * snapshot.
 *
 * Only server bundles get the snapshot. In a browser bundle the alias points
 * at a module that imports `server-only`, so a client component that
 * imports `@inth/sdk/generated` fails the build instead of shipping it.
 *
 * The fetch waits at most 10 seconds. When it fails, `next build` and
 * `next dev` log a warning and write a module whose `snapshot` is
 * `undefined`, so the server fetches the policy at runtime and asks the
 * backend's `/init` while the manifest is unavailable. A missing backend
 * URL counts as a failed fetch. Set `onBuildError: 'fail'`, or
 * `INTH_ON_BUILD_ERROR=fail`, to stop the build instead. The fetch is skipped
 * for a `projectUrl` that is not absolute http(s), for `output: 'export'`,
 * which has no server, and when `inth.config.ts` sets a mode that reads no
 * build-time manifest (`needsBuildSnapshot` in `@inth/sdk/server`):
 * `hosted()`, `testing()`, `manifest({ snapshot })`,
 * `manifest({ source: 'runtime' })` or an absolute
 * `manifest({ manifestUrl })`. The wrapper evaluates the file with the
 * loader Next.js uses for `next.config.ts` to read its `mode` and
 * `projectUrl`.
 *
 * The config and the snapshot reach the helpers through bundler aliases.
 * The wrapper adds `@inth/sdk` and `@inth/nextjs` to
 * `transpilePackages`, so Pages Router server bundles apply them too. A
 * package listed in `serverExternalPackages` stays external and does not
 * see the aliases: it reads no config and fetches the manifest at runtime.
 *
 * When `NEXT_PUBLIC_INTH_PROJECT_URL` is unset, the wrapper reads
 * `NEXT_PUBLIC_C15T_BACKEND_URL` instead and sets
 * `NEXT_PUBLIC_INTH_PROJECT_URL` to it, in the environment and in the
 * config's `env`, so every reader of the Inth name sees the same URL.
 *
 * @param config - Existing Next.js configuration, preserved as given apart
 * from the alias and `env`, which gains the Inth variable.
 * @param options - Backend URL and `onBuildError`. `projectUrl` defaults to
 * the one in `inth.config.ts`, then `NEXT_PUBLIC_INTH_PROJECT_URL`, from
 * the environment or a `.env` file, and the build appends `/manifest`.
 * @returns An asynchronous Next.js configuration factory.
 * @throws {Error} When the fetch fails in `'fail'` mode, the snapshot cannot be written, or `defineConsentConfig`
 * rejects `inth.config.ts`.
 * @example
 * ```ts
 * import { withConsentManifest } from '@inth/nextjs/build';
 *
 * // Reads NEXT_PUBLIC_INTH_PROJECT_URL, like defineConsentConfig.
 * export default withConsentManifest({});
 * ```
 *
 * ```ts
 * // inth.config.ts
 * import { defineConsentConfig } from '@inth/nextjs';
 *
 * export default defineConsentConfig({});
 * ```
 */
export const withConsentManifest =
	(
		config: ConsentNextConfig,
		options: ManifestBuildOptions = {}
	): ((
		phase: string,
		context: { defaultConfig: NextConfig }
	) => Promise<NextConfig>) =>
	async (phase, context) => {
		const root = process.cwd();
		const envSource = {
			mode: phase === PHASE_PRODUCTION_BUILD ? 'production' : 'development',
			root,
		};
		const legacyURL = exposeLegacyProjectUrl(envSource);
		const given =
			typeof config === 'function' ? await config(phase, context) : config;
		const resolved: NextConfig =
			legacyURL === undefined
				? given
				: { ...given, env: { ...given.env, [BACKEND_URL_ENV]: legacyURL } };
		if (
			phase !== PHASE_PRODUCTION_BUILD &&
			phase !== PHASE_DEVELOPMENT_SERVER
		) {
			return resolved;
		}
		const userConfigFile = findUserConfig(root);
		const userConfig = userConfigFile
			? await loadUserConfig(userConfigFile, root)
			: undefined;
		const files = await writeManifestCacheModule(
			{
				...options,
				projectUrl:
					options.projectUrl ??
					userConfig?.projectUrl ??
					readBuildEnv([BACKEND_URL_ENV], envSource),
			},
			{
				command: phase === PHASE_PRODUCTION_BUILD ? 'build' : 'dev',
				envNames: [BACKEND_URL_ENV],
				importSource: '@inth/nextjs/static',
				label: '@inth/nextjs/build',
				mode: userConfig?.mode,
				skipReason:
					resolved.output === 'export'
						? "a static export (`output: 'export'`) has no server to use it"
						: undefined,
			}
		);
		return withConsentAliases(resolved, files, userConfigFile);
	};
