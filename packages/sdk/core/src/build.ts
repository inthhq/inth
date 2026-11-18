/** Node-only manifest generation for framework build integrations. */
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { ConsentManifest } from '@inth/sdk-schema/types';

import { createDialogChunkPlugin } from './build-dialog-chunk';
import type { DialogChunkPlugin } from './build-dialog-chunk';
import {
	clientBannerPath,
	deferredSheetSpecifier,
	findPageBanner,
	injectStaticBanner,
	loadStaticBannerRenderer,
	renderStaticBannerHtml,
	renderStaticBannerSheets,
} from './build-static-banner';
import type { StaticBannerChunk } from './build-static-banner';
import {
	PREFETCH_SCRIPT_ID,
	prefetchScriptOffset,
} from './libs/prefetch/placement';
import { buildPrefetchScript } from './libs/prefetch/prefetch';
import type { PrefetchOptions } from './libs/prefetch/types';
import type { ConsentMode } from './modes';
import { buildSnapshotSkipReason } from './server/server-mode';
import { loadStaticManifest } from './server/static-manifest';
import { manifestNeedsLocation } from './transports/manifest-browser-location';

export type { ConsentManifest } from '@inth/sdk-schema/types';
export { createDialogChunkPlugin } from './build-dialog-chunk';
export {
	CORE_CHUNK_MODULES,
	CORE_FIRST_LOAD_MODULES,
	CORE_SURFACE_CONFIG_MODULES,
	coreModuleFile,
	coreModulePattern,
} from './chunk-modules';
export { DEFERRED_SHEET_SPECIFIERS } from './build-static-banner';
export type { DialogChunkPlugin } from './build-dialog-chunk';

const resolveBuildManifestUrl = (
	options: {
		projectUrl?: string;
		manifestUrl?: string;
	},
	label: string
): string => {
	const source = options.manifestUrl ?? options.projectUrl;
	let url: URL;
	try {
		url = new URL(source ?? '');
	} catch {
		throw new Error(
			`${label}: build-time manifests require an absolute upstream URL.`
		);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(
			`${label}: build-time manifests require an http(s) upstream URL.`
		);
	}
	if (options.manifestUrl === undefined) {
		url.pathname = `${url.pathname.replace(/\/+$/u, '')}/manifest`;
	}
	return url.href;
};

/**
 * Loads a snapshot from an absolute upstream URL during framework setup.
 * @param options - Manifest URL, or backend URL whose `/manifest` is read.
 * @param label - Framework name for errors.
 * @throws {Error} When the source is relative, missing or cannot be fetched.
 * @internal
 */
export const loadBuildManifest = (
	options: {
		projectUrl?: string;
		manifestUrl?: string;
		fetch?: typeof globalThis.fetch;
	},
	label: string
): Promise<ConsentManifest> =>
	loadStaticManifest(
		{
			fetch: options.fetch,
			manifestUrl: resolveBuildManifestUrl(options, label),
		},
		label
	);

/**
 * Longest a build or dev server waits for the manifest, in milliseconds.
 * A backend that never answers then counts as a failed fetch instead of
 * holding the command.
 */
const BUILD_MANIFEST_TIMEOUT_MS = 10_000;

/**
 * Whether a build can fetch the manifest: the upstream URL is absolute
 * http(s). A relative URL points at the app being built.
 * @param options - Manifest URL, or backend URL whose `/manifest` is read.
 * @returns `true` when {@link loadBuildManifest} has a URL to fetch.
 * @internal
 */
export const hasBuildManifestSource = (options: {
	projectUrl?: string;
	manifestUrl?: string;
}): boolean => {
	try {
		resolveBuildManifestUrl(options, '');
		return true;
	} catch {
		return false;
	}
};

/**
 * What happens when the build-time manifest fetch fails. `'runtime'` (the
 * default) logs a warning, and the server fetches the policy at runtime,
 * falling back to the backend's `/init` when the manifest is still
 * unavailable. `'fail'` stops the command with an error.
 */
export type ManifestBuildErrorMode = 'runtime' | 'fail';

/** Whether the framework is building for production or running dev. */
export type ManifestBuildCommand = 'build' | 'dev';

/** Environment variable that overrides `onBuildError` in every framework. */
export const MANIFEST_BUILD_ERROR_ENV = 'INTH_ON_BUILD_ERROR';

/** Inth variable suffixes, and the c15t suffixes they replaced. */
const LEGACY_ENV_SUFFIXES = [
	['INTH_PROJECT_URL', 'C15T_BACKEND_URL'],
	['INTH_ON_BUILD_ERROR', 'C15T_ON_BUILD_ERROR'],
] as const;

/**
 * The c15t name an Inth variable replaced, such as `VITE_C15T_BACKEND_URL`
 * for `VITE_INTH_PROJECT_URL`. Builds still read it when the Inth name is
 * unset.
 * @param name - An Inth variable name, with any framework prefix.
 * @returns The legacy name, or `undefined` when the name has none.
 * @internal
 */
export const legacyEnvName = (name: string): string | undefined => {
	for (const [inth, legacy] of LEGACY_ENV_SUFFIXES) {
		if (name === inth || name.endsWith(`_${inth}`)) {
			return `${name.slice(0, -inth.length)}${legacy}`;
		}
	}
	return undefined;
};

/**
 * Where {@link readBuildEnv} looks besides the process environment:
 * variables the framework already loaded, the directory with the `.env`
 * files, and the mode, such as `production`.
 */
export interface BuildEnvSource {
	env?: Record<string, unknown>;
	mode?: string;
	root?: string;
}

/** Values in a `.env` file. Handles `export`, quotes and comments. */
const parseEnvFile = (source: string): Record<string, string> => {
	const values: Record<string, string> = {};
	for (const raw of source.split(/\r?\n/u)) {
		const line = raw.trim().replace(/^export\s+/u, '');
		const equals = line.indexOf('=');
		if (line.startsWith('#') || equals < 1) {
			continue;
		}
		const key = line.slice(0, equals).trim();
		let value = line.slice(equals + 1).trim();
		const [quote] = value;
		// A quoted value ends at its closing quote, so a comment after it,
		// as in `KEY="https://x" # note`, is dropped with the quotes.
		const close = quote === '"' || quote === "'" ? value.indexOf(quote, 1) : -1;
		// Unquoted, `#` starts a comment as in dotenv, with or without a
		// space before it.
		value =
			close > 0 ? value.slice(1, close) : (value.split('#', 1)[0] ?? '').trim();
		values[key] = value;
	}
	return values;
};

/**
 * Reads the first of `names` that is set, then the first of their
 * {@link legacyEnvName legacy names}, and says which name it read. Each
 * name is looked up the way Vite resolves variables: values the framework
 * already loaded, then the process environment, then `.env.[mode].local`,
 * `.env.[mode]`, `.env.local` and `.env` in `root`. An earlier name wins
 * wherever it is set, so `VITE_INTH_PROJECT_URL` in `.env` beats
 * `VITE_C15T_BACKEND_URL` in the environment. An empty value counts as
 * unset.
 * @param names - Inth variable names in order of preference.
 * @param options - Where to look besides the process environment.
 * @returns The name and its value, or `undefined` when no name is set.
 * @internal
 */
export const readBuildEnvEntry = (
	names: readonly string[],
	options: BuildEnvSource = {}
): { name: string; value: string } | undefined => {
	let parsed: Record<string, string>[] | undefined;
	const readFiles = (root: string): Record<string, string>[] => {
		const files = [
			...(options.mode
				? [`.env.${options.mode}.local`, `.env.${options.mode}`]
				: []),
			'.env.local',
			'.env',
		];
		return files.map((file) => {
			try {
				return parseEnvFile(readFileSync(resolve(root, file), 'utf8'));
			} catch {
				return {};
			}
		});
	};
	const legacy = names.flatMap((name) => legacyEnvName(name) ?? []);
	for (const name of [...names, ...legacy]) {
		const loaded = options.env?.[name];
		if (typeof loaded === 'string' && loaded !== '') {
			return { name, value: loaded };
		}
		const fromProcess = process.env[name];
		if (fromProcess) {
			return { name, value: fromProcess };
		}
		if (!options.root) {
			continue;
		}
		parsed ??= readFiles(options.root);
		const files = parsed;
		// `${NAME}` and `$NAME` expand as Vite's dotenv-expand does: from the
		// process environment, then the files; `\$` stays a literal `$`.
		const expand = (value: string, depth: number): string =>
			value.replace(
				/\\?\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)/gu,
				(match: string) => {
					if (match.startsWith('\\')) {
						return match.slice(1);
					}
					const key = match.replace(/^\$\{?|\}$/gu, '');
					const found =
						process.env[key] ?? files.find((values) => key in values)?.[key];
					return found === undefined || depth > 8
						? ''
						: expand(found, depth + 1);
				}
			);
		for (const values of files) {
			if (values[name]) {
				const value = expand(values[name], 0);
				return value ? { name, value } : undefined;
			}
		}
	}
	return undefined;
};

/**
 * The value {@link readBuildEnvEntry} finds.
 * @param names - Inth variable names in order of preference.
 * @param options - Where to look besides the process environment.
 * @returns The value, or `undefined` when no name is set.
 * @internal
 */
export const readBuildEnv = (
	names: readonly string[],
	options: BuildEnvSource = {}
): string | undefined => readBuildEnvEntry(names, options)?.value;

const isBuildErrorMode = (value: unknown): value is ManifestBuildErrorMode =>
	value === 'runtime' || value === 'fail';

/**
 * Decides what a failed manifest fetch does. `INTH_ON_BUILD_ERROR` wins over
 * `onBuildError`. Without either, the build and dev fall back to runtime
 * fetching with a warning.
 * @param label - Framework name for errors.
 * @param source - Where to read the variable besides the process
 * environment.
 * @returns The mode, and whether the user chose it.
 * @throws {Error} When the option or the variable has another value.
 * @internal
 */
export const resolveManifestBuildErrorMode = (
	onBuildError: unknown,
	label: string,
	source: BuildEnvSource = {}
): { explicit: boolean; mode: ManifestBuildErrorMode } => {
	const fromEnv = readBuildEnv([MANIFEST_BUILD_ERROR_ENV], source);
	if (fromEnv) {
		if (!isBuildErrorMode(fromEnv)) {
			throw new Error(
				`${label}: ${MANIFEST_BUILD_ERROR_ENV} must be 'runtime' or 'fail', received ${JSON.stringify(fromEnv)}.`
			);
		}
		return { explicit: true, mode: fromEnv };
	}
	if (onBuildError !== undefined) {
		if (!isBuildErrorMode(onBuildError)) {
			throw new Error(
				`${label}: onBuildError must be 'runtime' or 'fail', received ${JSON.stringify(onBuildError)}.`
			);
		}
		return { explicit: true, mode: onBuildError };
	}
	return { explicit: false, mode: 'runtime' };
};

/** Where a build reports a skipped or failed manifest fetch. */
export interface ManifestBuildLogger {
	info: (message: string) => void;
	warn: (message: string) => void;
}

/**
 * Prefixes every message with the framework label, for loggers that do not
 * add one themselves.
 * @param logger - Where messages go. Defaults to the console.
 * @internal
 */
export const labelledBuildLogger = (
	label: string,
	logger: ManifestBuildLogger = console
): ManifestBuildLogger => ({
	info: (message) => logger.info(`${label}: ${message}`),
	warn: (message) => logger.warn(`${label}: ${message}`),
});

/** How a framework integration loads the build-time manifest. */
export interface ManifestBuildPolicy {
	/** Production build or dev, named in messages. */
	command: ManifestBuildCommand;
	/** Variables that can carry the backend URL, named in messages. */
	envNames?: readonly string[];
	/** Where `INTH_ON_BUILD_ERROR` is read besides the process environment. */
	envSource?: BuildEnvSource;
	/** Framework name for errors. */
	label: string;
	/** Receives skip notices and warnings, without the label. */
	logger: ManifestBuildLogger;
	onBuildError?: unknown;
	/**
	 * Why the framework cannot use a snapshot, such as a static export. The
	 * fetch is skipped and never fails.
	 */
	skipReason?: string;
	/**
	 * The app's mode, when the integration can read it. A mode that reads
	 * no build snapshot (see `needsBuildSnapshot` in `@inth/sdk/server`)
	 * skips the fetch, as `skipReason` does.
	 */
	mode?: ConsentMode;
	/** Appended to the error a failed fetch throws, naming another fix. */
	failureHint?: string;
	/**
	 * For a fetch the build can do without: a failure only warns, with the
	 * message this returns for the failure's reason, whatever
	 * `onBuildError` says.
	 */
	bestEffort?: (reason: string) => string;
}

const describeFailure = (error: unknown, label: string): string => {
	if (error instanceof Error && error.name === 'TimeoutError') {
		return `no response within ${BUILD_MANIFEST_TIMEOUT_MS / 1000} seconds`;
	}
	let reason = error instanceof Error ? error.message : String(error);
	const prefix = `${label}: `;
	if (reason.startsWith(prefix)) {
		reason = reason.slice(prefix.length);
	}
	// A network error is a bare `fetch failed`; the useful part, such as
	// ECONNREFUSED, is in its cause.
	if (error instanceof TypeError && error.cause instanceof Error) {
		reason = `${reason}: ${error.cause.message}`;
	}
	return reason;
};

/**
 * What a failed fetch does under this policy. A best-effort fetch only
 * warns, as an explicit `'runtime'` would.
 */
const failureModeFor = (
	policy: ManifestBuildPolicy
): { explicit: boolean; mode: ManifestBuildErrorMode } =>
	policy.bestEffort
		? { explicit: true, mode: 'runtime' }
		: resolveManifestBuildErrorMode(
				policy.onBuildError,
				policy.label,
				policy.envSource
			);

/**
 * Applies the build policy to a missing backend URL, which counts as a
 * failed fetch: `'fail'` throws, an explicit `'runtime'` logs a notice, and
 * the dev default warns.
 */
const reportMissingSource = (
	policy: ManifestBuildPolicy,
	resolved: { explicit: boolean; mode: ManifestBuildErrorMode },
	envHint: string
): void => {
	const { command, label, logger } = policy;
	const missing = `no backend URL is set, so ${command === 'build' ? 'the build' : 'dev'} cannot fetch the consent manifest.${envHint}`;
	if (resolved.mode === 'fail') {
		throw new Error(
			`${label}: ${missing} Set \`${MANIFEST_BUILD_ERROR_ENV}=runtime\` (or \`onBuildError: 'runtime'\`) to ${command === 'build' ? 'build' : 'run dev'} without a snapshot.`
		);
	}
	if (resolved.explicit) {
		logger.info(
			`skipped the consent manifest fetch because no backend URL is set.${envHint}`
		);
		return;
	}
	logger.warn(
		`${missing} The server fetches it at runtime, or asks the backend's /init.`
	);
};

/**
 * Applies the build policy to a failed fetch: a best-effort fetch warns
 * with its own message, `'fail'` throws, and `'runtime'` warns.
 */
const reportFetchFailure = (
	policy: ManifestBuildPolicy,
	resolved: { explicit: boolean; mode: ManifestBuildErrorMode },
	url: string,
	error: unknown
): void => {
	const { command, label, logger } = policy;
	const reason = describeFailure(error, label);
	if (policy.bestEffort) {
		logger.warn(policy.bestEffort(reason));
		return;
	}
	const failure = `could not fetch the consent manifest from ${url} during ${command === 'build' ? 'the build' : 'dev'} (${reason}).`;
	if (resolved.mode === 'fail') {
		throw new Error(
			`${label}: ${failure} Set \`${MANIFEST_BUILD_ERROR_ENV}=runtime\` (or \`onBuildError: 'runtime'\`) to ${command === 'build' ? 'deploy' : 'run dev'} with runtime fetching.${policy.failureHint ?? ''}`,
			{ cause: error }
		);
	}
	logger.warn(
		`${failure} The server fetches it at runtime instead, and asks the backend's /init while it is unavailable.${
			resolved.explicit
				? ''
				: ` Set \`${MANIFEST_BUILD_ERROR_ENV}=fail\` (or \`onBuildError: 'fail'\`) to stop the build on this error.`
		}`
	);
};

/**
 * Loads the snapshot a framework integration bundles, following one policy
 * in every framework:
 *
 * - The fetch waits at most 10 seconds.
 * - When it fails, `onBuildError` decides: `'runtime'` (the default)
 *   warns and returns `undefined` so the server fetches the policy at
 *   runtime, and asks the backend's `/init` when that fails too. `'fail'`
 *   throws. `INTH_ON_BUILD_ERROR` overrides the option.
 * - A missing backend URL counts as a failed fetch: `'fail'` throws, the
 *   default warns, and an explicit `'runtime'` skips with a notice.
 * - A framework `skipReason` skips the fetch. So does a relative or
 *   non-http(s) URL, unless `onBuildError` is explicitly `'fail'`, which
 *   then throws.
 *
 * @param source - Manifest URL, or backend URL whose `/manifest` is read.
 * @param policy - Command, label, logger, `onBuildError` and skip reason.
 * @returns The deployment's manifest, or `undefined` to fetch at runtime.
 * @throws {Error} When the fetch fails in `'fail'` mode, or `onBuildError`
 * or `INTH_ON_BUILD_ERROR` has an unknown value.
 * @internal
 */
export const loadManifestForBuild = async (
	source: {
		projectUrl?: string;
		manifestUrl?: string;
		fetch?: typeof globalThis.fetch;
	},
	policy: ManifestBuildPolicy
): Promise<ConsentManifest | undefined> => {
	const { label, logger } = policy;
	const { explicit, mode } = failureModeFor(policy);
	const skipReason = policy.skipReason ?? buildSnapshotSkipReason(policy.mode);
	if (skipReason) {
		logger.info(`skipped the consent manifest fetch because ${skipReason}.`);
		return undefined;
	}
	const envHint = policy.envNames?.length
		? ` Pass projectUrl or set ${policy.envNames.join(' or ')}.`
		: '';
	const configured = source.manifestUrl ?? source.projectUrl;
	if (!configured) {
		reportMissingSource(policy, { explicit, mode }, envHint);
		return undefined;
	}
	if (!hasBuildManifestSource(source)) {
		if (explicit && mode === 'fail') {
			try {
				resolveBuildManifestUrl(source, label);
			} catch (error) {
				throw new Error(`${(error as Error).message}${envHint}`, {
					cause: error,
				});
			}
		}
		logger.info(
			`skipped the consent manifest fetch because ${JSON.stringify(configured)} is not an absolute http(s) URL, so the server fetches the policy at runtime.`
		);
		return undefined;
	}
	const fetchImpl = source.fetch ?? globalThis.fetch?.bind(globalThis);
	const url = resolveBuildManifestUrl(source, label);
	try {
		return await loadBuildManifest(
			{
				...source,
				fetch:
					fetchImpl &&
					((input, init) =>
						fetchImpl(input, {
							...init,
							signal: AbortSignal.timeout(BUILD_MANIFEST_TIMEOUT_MS),
						})),
			},
			label
		);
	} catch (error) {
		reportFetchFailure(policy, { explicit, mode }, url, error);
		return undefined;
	}
};

/** Options every build integration takes. */
export interface ManifestBuildOptions {
	/**
	 * Absolute backend base URL. The build appends `/manifest`. Framework
	 * integrations read their public backend URL variable when it is unset.
	 */
	projectUrl?: string;
	/**
	 * What a failed manifest fetch does. `'runtime'` (the default) logs a
	 * warning, and the server fetches the policy at runtime, asking the
	 * backend's `/init` while the manifest is unavailable. `'fail'` stops
	 * the command. The `INTH_ON_BUILD_ERROR` environment variable
	 * overrides this option.
	 */
	onBuildError?: ManifestBuildErrorMode;
	/**
	 * Fetch implementation for the manifest request.
	 * @internal
	 */
	fetch?: typeof globalThis.fetch;
}

/** Options of the `consentManifest()` Vite plugins. */
export interface ConsentManifestPluginOptions extends ManifestBuildOptions {
	/**
	 * `'runtime'` never downloads a snapshot: `@inth/sdk/generated`
	 * exports `snapshot: undefined` and the app reads the manifest at
	 * runtime. Set it when the app's `manifest()` passes an absolute
	 * `manifestUrl` or `source: 'runtime'` (the modes `needsBuildSnapshot`
	 * in `@inth/sdk/server` says read none). Those discard the build's
	 * snapshot, but the bundle still imports it, so without this option the
	 * build fetches `${projectUrl}/manifest` and fails when that fetch
	 * fails.
	 *
	 * @default 'build'
	 */
	source?: 'build' | 'runtime';
	/**
	 * Adds an inline script to `index.html` that sends the `/init` request
	 * as the browser parses `<head>`, while the bundle downloads. `hosted()`
	 * then reads that response instead of sending its own request.
	 *
	 * On by default. A production build that bundles the snapshot, as
	 * `manifest()` does, or sets `source: 'runtime'` leaves the script out,
	 * and so does a server-rendered app. The dev server can't tell which
	 * mode the app uses and always adds it, so a `manifest()` app sends one
	 * unused `/init` per page load in dev. Pass `false` to turn it off, or
	 * an object when the app sets `credentials`, `overrides` or `storageKey`
	 * on `hosted()` or the provider, turns `journey` off or runs an
	 * `experiment`, so the early request matches the one the app would send.
	 * Under a Content Security Policy, set Vite's `html.cspNonce` or allow
	 * the script's hash.
	 *
	 * @default true
	 */
	initPrefetch?: boolean | InitPrefetchOptions;
	/**
	 * Puts `@inth/react`'s stock banner in `index.html`, so it shows as soon
	 * as the `initPrefetch` request answers instead of after the app's
	 * JavaScript has run.
	 *
	 * `vite build` reads the manifest and renders the banner of its first
	 * choice policy, in the page's `<html lang>` (else English), hidden. The
	 * `/init` script then shows it when the answer names the same policy,
	 * language, branding and copy, and the visitor has no stored choice;
	 * otherwise the page removes it. `<ConsentBanner />` takes its place when
	 * it renders. A tap on it before then hides it and is recorded once the
	 * app has loaded.
	 *
	 * The banner's stylesheets move from the JavaScript into `index.html`
	 * for every page whose entry imports `ConsentBanner`, banner or not.
	 *
	 * Only a production build of a page whose entry imports `ConsentBanner`
	 * from `@inth/react` or `@inth/react` gets it, and only with the
	 * `initPrefetch` script. A failed manifest fetch leaves the banner out
	 * with a warning; it never fails the build. The build cannot read the
	 * provider's options, so set `false` when the app's banner differs from
	 * the stock one at first render: `i18n` messages, `legalLinks`, a
	 * `theme`, `components` slots, banner props, or a banner of its own.
	 *
	 * @default true
	 */
	staticBanner?: boolean;
}

/** Options of the inline `/init` script `initPrefetch` adds. */
export type InitPrefetchOptions = Pick<
	PrefetchOptions,
	'credentials' | 'experiment' | 'journey' | 'overrides' | 'storageKey'
>;

/** What `@inth/sdk/generated` exports. */
export interface GeneratedManifestModule {
	/** The backend URL the build read the manifest from. */
	projectUrl: string | undefined;
	/** The fetched manifest, or `undefined` to read it at runtime. */
	snapshot: ConsentManifest | undefined;
}

/**
 * The module the build integrations answer with the fetched snapshot. A
 * framework package's own `generated` entry re-exports it; the Vite plugin
 * serves those too for the packages its adapter names.
 * @internal
 */
export const GENERATED_MODULE_ID = '@inth/sdk/generated';

/** Where non-Vite builds write the snapshot, relative to the app root. */
export const MANIFEST_CACHE_DIR = 'node_modules/.cache/inth';

/**
 * Renders the module behind `@inth/sdk/generated`. With `serverOnly`, it
 * imports `server-only`, so a bundler that knows the marker (Next.js) fails
 * the build when client code imports it. With `clientStub`, `snapshot` is
 * `undefined` whatever the build fetched.
 * @param options - Whether to leave the snapshot out, and whether to add
 * the `server-only` import.
 * @internal
 */
export const renderGeneratedModule = (
	module: GeneratedManifestModule,
	options: { clientStub?: boolean; serverOnly?: boolean } = {}
): string => {
	let snapshot = `export const snapshot = ${JSON.stringify(module.snapshot, null, 2)};`;
	if (options.clientStub) {
		snapshot =
			'// The snapshot stays on the server; the browser bundle never gets it.\nexport const snapshot = undefined;';
	} else if (!module.snapshot) {
		snapshot =
			'// The build has no snapshot, so the policy is read at runtime.\nexport const snapshot = undefined;';
	}
	return [
		'// Written by the Inth build integration. Do not edit.',
		...(options.serverOnly ? ["import 'server-only';"] : []),
		`export const projectUrl = ${JSON.stringify(module.projectUrl) ?? 'undefined'};`,
		snapshot,
		'',
	].join('\n');
};

/**
 * Renders declarations for a written `@inth/sdk/generated` module.
 * @param importSource - Module the `ConsentManifest` type is imported from.
 * @returns TypeScript declarations.
 * @internal
 */
export const renderGeneratedDeclarations = (importSource: string): string =>
	[
		`import type { ConsentManifest } from '${importSource}';`,
		'',
		'export declare const projectUrl: string | undefined;',
		'export declare const snapshot: ConsentManifest | undefined;',
		'',
	].join('\n');

/** Writes `source` unless the file already holds it, so watchers stay quiet. */
const writeModuleFile = async (
	outputFile: string,
	source: string
): Promise<string> => {
	let current: string | undefined;
	try {
		current = await readFile(outputFile, 'utf8');
	} catch (error) {
		if (
			!(error instanceof Error && 'code' in error && error.code === 'ENOENT')
		) {
			throw error;
		}
	}
	if (current !== source) {
		await mkdir(dirname(outputFile), { recursive: true });
		await writeFile(outputFile, source, 'utf8');
	}
	return outputFile;
};

/** The files {@link writeManifestCacheModule} writes. */
export interface ManifestCacheFiles {
	/** The module for browser bundles: `server-only`, and no snapshot. */
	browser: string;
	/** The module for server bundles, with the snapshot. */
	server: string;
}

/**
 * Fetches the snapshot under the policy of {@link loadManifestForBuild} and
 * writes it under `node_modules/.cache/inth/`, for bundlers without virtual
 * modules. `manifest.js` holds the snapshot for server bundles.
 * `manifest.browser.js` is for browser bundles: it imports `server-only`, so
 * a bundler that knows the marker (Next.js) fails the build, and its
 * `snapshot` is `undefined` in any case. `manifest.d.ts` types
 * `manifest.js`.
 *
 * Without a snapshot, `manifest.js` exports `undefined`, so imports still
 * compile and the server fetches the manifest at runtime. A failure in
 * `'fail'` mode leaves the files untouched. An unchanged file is not
 * rewritten.
 *
 * @param defaults - Framework label, type import, app root, command,
 * backend URL variables, and why the framework cannot use a snapshot.
 * @param logger - Receives skip notices and warnings, without the label.
 * @returns The absolute paths of the server and browser modules.
 * @throws {Error} When the fetch fails in `'fail'` mode, or a file cannot be
 * written.
 * @internal
 */
export const writeManifestCacheModule = async (
	options: ManifestBuildOptions,
	defaults: {
		command: ManifestBuildCommand;
		envNames?: readonly string[];
		importSource: string;
		label: string;
		mode?: ConsentMode;
		rootDir?: string;
		skipReason?: string;
	},
	logger: ManifestBuildLogger = labelledBuildLogger(defaults.label)
): Promise<ManifestCacheFiles> => {
	const rootDir = defaults.rootDir ?? process.cwd();
	const snapshot = await loadManifestForBuild(
		{ fetch: options.fetch, projectUrl: options.projectUrl },
		{
			command: defaults.command,
			envNames: defaults.envNames,
			envSource: {
				mode: defaults.command === 'build' ? 'production' : 'development',
				root: rootDir,
			},
			label: defaults.label,
			logger,
			mode: defaults.mode,
			onBuildError: options.onBuildError,
			skipReason: defaults.skipReason,
		}
	);
	const directory = resolve(rootDir, MANIFEST_CACHE_DIR);
	const module = { projectUrl: options.projectUrl, snapshot };
	const [server, browser] = await Promise.all([
		writeModuleFile(
			join(directory, 'manifest.js'),
			renderGeneratedModule(module)
		),
		writeModuleFile(
			join(directory, 'manifest.browser.js'),
			renderGeneratedModule(module, { clientStub: true, serverOnly: true })
		),
		writeModuleFile(
			join(directory, 'manifest.d.ts'),
			renderGeneratedDeclarations(defaults.importSource)
		),
	]);
	return { browser, server };
};

/** The slice of Vite's resolved config the manifest plugin reads. */
export interface ManifestPluginConfig {
	build?: ConsentManifestUserConfig['build'];
	command?: 'build' | 'serve';
	env?: Record<string, unknown>;
	envDir?: string | false;
	environments?: ConsentManifestUserConfig['environments'];
	logger?: ManifestBuildLogger;
	mode?: string;
	plugins?: readonly { name: string }[];
	root: string;
}

/** The slice of a Vite plugin context `load` reads. */
export interface ManifestPluginContext {
	environment?: { config?: { consumer?: 'client' | 'server' } };
}

/** What the plugin's `config` hook reads from Vite's plugin context. */
export interface ConsentManifestConfigContext {
	meta?: { rolldownVersion?: string };
}

/** The build options the `config` hook reads, of the app or an environment. */
export interface ConsentManifestBuildConfig {
	ssr?: unknown;
	rolldownOptions?: { input?: unknown; output?: unknown };
	rollupOptions?: { input?: unknown; output?: unknown };
}

/** The slice of the app's Vite config the `config` hook reads. */
export interface ConsentManifestUserConfig {
	build?: ConsentManifestBuildConfig;
	/**
	 * Vite's Environment API: the client and the server build share this
	 * config, as Nuxt 5 (and Nuxt 4 with `compatibilityVersion: 5`) builds.
	 */
	environments?: Record<
		string,
		{ build?: ConsentManifestBuildConfig } | undefined
	>;
}

/**
 * Whether a build's entries include an HTML page: Vite's default
 * `index.html`, or an `.html` input. A build without one, such as a backend
 * that renders its own pages around the bundle, has no `index.html` to put
 * the banner's stylesheets in.
 */
const buildsHtml = function buildsHtml(
	config: ConsentManifestUserConfig | undefined
): boolean {
	const input =
		config?.build?.rolldownOptions?.input ??
		config?.build?.rollupOptions?.input;
	if (input === undefined) {
		return true;
	}
	const entries =
		typeof input === 'object' && input !== null && !Array.isArray(input)
			? Object.values(input)
			: [input].flat();
	return entries.some(
		(entry) => typeof entry === 'string' && /\.html?$/iu.test(entry)
	);
};

/** A Rolldown code-splitting group. */
export interface ConsentChunkGroup {
	name: string;
	test: RegExp;
	tags: string[];
	entriesAware: boolean;
	includeDependenciesRecursively: boolean;
}

/**
 * Every SDK package under `node_modules`, whatever the package manager:
 * `@inth/sdk` and the framework packages, not the CLI.
 */
const INTH_MODULE = /[\\/]node_modules[\\/]@inth[\\/](?!cli[\\/])/u;

/**
 * Puts the Inth modules a page's entry imports statically into one chunk.
 * Rolldown otherwise splits the modules a page shares with Inth's lazy
 * chunks into many small ones, and each costs a request: on a slow mobile
 * connection with a warm cache, a revalidation round trip apiece before the
 * page renders. Only modules Inth ships; their dependencies (React) stay
 * where Rolldown puts them, so a page without Inth loads none of it. One
 * chunk for every entry (`entriesAware` would count Inth's lazy chunks as
 * entries and split it again): an app with several entries that use
 * different parts of Inth loads all of them on each.
 */
export const CONSENT_CHUNK_GROUP: ConsentChunkGroup = {
	entriesAware: false,
	includeDependenciesRecursively: false,
	name: 'inth',
	tags: ['$initial'],
	test: INTH_MODULE,
};

/** Rolldown versions whose groups take `tags` (tested with 1.2). */
const groupsTakeTags = function groupsTakeTags(version: string | undefined) {
	const [major = 0, minor = 0] = (version ?? '').split('.').map(Number);
	return major > 1 || (major === 1 && minor >= 2);
};

/**
 * Whether to add {@link CONSENT_CHUNK_GROUP}: a client build on a Rolldown
 * that supports it, whose app sets no chunking of its own. Setting
 * `codeSplitting`, `advancedChunks` or `manualChunks` opts out.
 */
export const shouldGroupConsentChunks = function shouldGroupConsentChunks(
	context: ConsentManifestConfigContext | undefined,
	config: ConsentManifestUserConfig | undefined,
	env: { isSsrBuild?: boolean } | undefined
): boolean {
	if (env?.isSsrBuild || config?.build?.ssr) {
		return false;
	}
	if (!groupsTakeTags(context?.meta?.rolldownVersion)) {
		return false;
	}
	// The app's chunking, and the client environment's in a shared config.
	const outputs = [config?.build, config?.environments?.client?.build].flatMap(
		(build) => [build?.rolldownOptions?.output, build?.rollupOptions?.output]
	);
	return !outputs.some(
		(output) =>
			typeof output === 'object' &&
			output !== null &&
			('codeSplitting' in output ||
				'advancedChunks' in output ||
				'manualChunks' in output)
	);
};

/** The build options {@link consentChunkGroupsConfig} sets. */
export interface ConsentChunkGroupsBuild {
	rolldownOptions: {
		output: { codeSplitting: { groups: ConsentChunkGroup[] } };
	};
	/**
	 * Never set. Vite 6 and 7 have no `rolldownOptions`; a key their
	 * `build` options share keeps the plugin assignable to them.
	 */
	rollupOptions?: undefined;
}

/** The Vite config {@link consentChunkGroupsConfig} returns. */
export interface ConsentChunkGroupsConfig {
	build?: ConsentChunkGroupsBuild;
	environments?: { client: { build: ConsentChunkGroupsBuild } };
}

/**
 * The Vite config that adds `groups` to the browser build's code splitting.
 *
 * With Vite's Environment API the client and the server build share one
 * config, and a plugin's `config` hook runs once for both. Nuxt 5, and Nuxt
 * 4 with `compatibilityVersion: 5`, build that way, and `addVitePlugin`'s
 * `server: false` scopes only the per-environment hooks. A top-level
 * `build` reaches the server build there, where the groups take the style
 * chunks Nuxt emits for its server render; Rolldown then leaves those
 * chunks' file names unresolved and Nitro fails on an import of
 * `preferences-styles-3.mjs-!~{031}~.js`. So a config that declares
 * `environments` gets the groups on its `client` environment, and a build
 * of its own gets them on `build`.
 *
 * @param config - The app's Vite config, as the `config` hook receives it.
 * @param groups - The groups, in priority order.
 * @returns The config slice for the hook to return.
 * @internal
 */
export const consentChunkGroupsConfig = function consentChunkGroupsConfig(
	config: ConsentManifestUserConfig | undefined,
	groups: ConsentChunkGroup[]
): ConsentChunkGroupsConfig {
	const build: ConsentChunkGroupsBuild = {
		rolldownOptions: { output: { codeSplitting: { groups } } },
	};
	return config?.environments
		? { environments: { client: { build } } }
		: { build };
};

/**
 * The Vite plugin each `consentManifest()` returns, typed structurally so it
 * fits the `plugins` array of every supported Vite version.
 */
export interface ConsentManifestPlugin {
	apply: (config: unknown, environment: { isPreview?: boolean }) => boolean;
	buildStart: () => void;
	/**
	 * `this` is Vite's plugin context, which differs between Vite versions, or
	 * nothing when called directly; the hook reads it as
	 * {@link ConsentManifestConfigContext}.
	 */
	config: (
		this: unknown,
		config?: ConsentManifestUserConfig,
		env?: { isSsrBuild?: boolean }
	) => {
		optimizeDeps: { exclude: string[] };
		ssr: { noExternal: string[] };
		build?: ConsentChunkGroupsBuild;
		environments?: ConsentChunkGroupsConfig['environments'];
	};
	configResolved: (config: ManifestPluginConfig) => void;
	enforce: 'pre';
	load: (
		this: ManifestPluginContext | undefined,
		id: string,
		options?: { ssr?: boolean }
	) => Promise<string | undefined>;
	name: string;
	/**
	 * Puts the stock dialog's on-demand code in one chunk in a Rolldown
	 * browser build ({@link createDialogChunkPlugin}).
	 */
	options: DialogChunkPlugin['options'];
	outputOptions: DialogChunkPlugin['outputOptions'];
	renderChunk: (code: string) => Promise<{ code: string; map: null } | null>;
	/**
	 * `this` is Vite's plugin context, or nothing when called directly; the
	 * hook reads it as {@link ManifestPluginResolveContext}.
	 */
	resolveId: (
		this: unknown,
		id: string,
		importer?: string,
		options?: { ssr?: boolean }
	) => Promise<string | undefined> | string | undefined;
	transformIndexHtml: (
		html: string,
		context?: ManifestHtmlContext
	) => Promise<string | undefined>;
}

/** The slice of a Vite plugin context `resolveId` reads. */
export interface ManifestPluginResolveContext extends ManifestPluginContext {
	resolve?: (
		id: string,
		importer?: string,
		options?: { skipSelf?: boolean }
	) => Promise<{ id: string } | null>;
}

/** The slice of Vite's `transformIndexHtml` context the plugin reads. */
export interface ManifestHtmlContext {
	/** The page's entry chunk; set in `vite build` only. */
	chunk?: StaticBannerChunk;
	/** Every output, by file name; set in `vite build` only. */
	bundle?: Readonly<Record<string, StaticBannerChunk>>;
}

/**
 * Logged when a single-page app bundles a policy that depends on where the
 * visitor is. The browser doesn't know that, so `manifest()` asks the
 * backend's `/init` anyway unless the page supplies a location.
 */
const LOCATION_ADVICE =
	"the consent policy depends on the visitor's location, which the browser doesn't know. Unless you pass `inputs` or `geoUrl` to `manifest()`, every first visit still calls the backend's /init, so the bundled policy adds bytes without saving a request. Consider leaving out `mode` and setting only `projectUrl`, which asks the hosted backend instead.";

/** The resolved id of the virtual `@inth/sdk/generated` module. */
const VIRTUAL_GENERATED_ID = '\0@inth/sdk/generated';

/**
 * Stand-ins a production build gives the generated module's exports until
 * tree-shaking has decided which ones the bundle reads. A pure call keeps
 * an unread export removable and stops the bundler from folding the value.
 */
const PLACEHOLDERS = {
	projectUrl: '__inth_build_backend_url__',
	snapshot: '__inth_build_snapshot__',
} as const;

const placeholderExpression = (token: string): string =>
	`/* @__PURE__ */ Object(${JSON.stringify(token)})`;

/** Matches a stand-in after the bundler rendered it, comment or not. */
const placeholderPattern = (token: string): RegExp =>
	new RegExp(
		`(?:/\\*\\s*[#@]__PURE__\\s*\\*/\\s*)?Object\\(\\s*(["'\`])${token}\\1\\s*\\)`,
		'gu'
	);

/**
 * Removes {@link CONSENT_CHUNK_GROUP} from a resolved config, for an app
 * the plugin learns only then is server-rendered.
 */
const dropConsentChunkGroup = function dropConsentChunkGroup(
	config: ManifestPluginConfig
): void {
	const builds = [
		config.build,
		...Object.values(config.environments ?? {}).map(
			(environment) => environment?.build
		),
	];
	for (const build of builds) {
		const output = build?.rolldownOptions?.output as
			| { codeSplitting?: { groups?: unknown[] } }
			| undefined;
		const groups = output?.codeSplitting?.groups;
		const index = groups?.indexOf(CONSENT_CHUNK_GROUP) ?? -1;
		if (groups && index !== -1) {
			groups.splice(index, 1);
		}
	}
};

/**
 * Builds the Vite plugin behind each `consentManifest` export. It serves
 * the virtual `@inth/sdk/generated` module, so no file is written into the
 * app. Preview uses the existing build. Without `projectUrl`, the first of
 * `envNames` that is set supplies it, or else their c15t names; the first
 * `VITE_` variable, when unset or empty, is then set to the URL used, so app
 * code reads the same value under the Inth name.
 *
 * The manifest is fetched only for a bundle that reads `snapshot`, which
 * the hosted backend and a testing value never do. The mode is chosen in app code, so
 * the plugin cannot know it from the Vite config:
 *
 * - `vite build` gives the exports stand-ins and fills them in after
 *   tree-shaking, in `renderChunk`. A chunk that still contains the
 *   snapshot triggers the fetch, under the build policy. A chunk that
 *   reads `projectUrl` when none is set gets the missing-URL policy.
 * - `vite dev` fetches when the module is first loaded, under the dev
 *   policy. Dev has no tree-shaking, so this also happens for a hosted
 *   app; dev only warns.
 *
 * A failed fetch can be retried.
 *
 * In a server-rendered framework, the client environment's module exports
 * `snapshot: undefined`, so the snapshot never reaches the browser bundle.
 * `projectUrl` is public and reaches every environment.
 *
 * The plugin keeps the virtual module out of dependency pre-bundling and
 * bundles the Inth packages in server builds, so an Inth package can import
 * `@inth/sdk/generated` as app code does.
 *
 * @param defaults - Framework label, backend URL variables, and whether the
 * framework renders on the server (a function receives the resolved config).
 * @internal
 */
export const createConsentManifestPlugin = (
	options: ConsentManifestPluginOptions,
	defaults: {
		envNames: readonly string[];
		label: string;
		serverRendered?: boolean | ((config: ManifestPluginConfig) => boolean);
		/**
		 * Packages whose modules import `@inth/sdk/generated`, through their
		 * own `generated` entry or directly. The plugin serves each one's
		 * `generated` entry and keeps it out of dependency pre-bundling, and
		 * server builds bundle the packages so the import reaches the plugin
		 * instead of Node. `@inth/sdk` is always included.
		 */
		packages?: readonly string[];
		/**
		 * Packages that ship framework source files, such as `.vue`, which
		 * Vite's dependency pre-bundling cannot load. They stay out of it.
		 */
		sourcePackages?: readonly string[];
		/**
		 * Warn when the snapshot's policy depends on the visitor's location,
		 * which a single-page app's `manifest()` can't resolve on its own.
		 */
		adviseHostedForLocation?: boolean;
	}
): ConsentManifestPlugin => {
	const importers = ['@inth/sdk', ...(defaults.packages ?? [])];
	const generatedIds = importers.map((name) => `${name}/generated`);
	let resolved: ManifestPluginConfig | undefined;
	let projectUrl: string | undefined;
	let serverRendered = defaults.serverRendered === true;
	let generation: Promise<ConsentManifest | undefined> | undefined;
	let missingURLReported = false;
	let bundlesSnapshot = false;
	let prefetchSkipReported = false;
	let htmlInput = true;
	const runtimeOnly = options.source === 'runtime';
	// The stock dialog's on-demand code in a few files (Vite 8).
	const dialogChunks = createDialogChunkPlugin();
	const command = (): ManifestBuildCommand =>
		resolved?.command === 'serve' ? 'dev' : 'build';
	const logger = (): ManifestBuildLogger =>
		labelledBuildLogger(defaults.label, resolved?.logger);
	const envSource = (): BuildEnvSource => ({
		env: resolved?.env,
		mode: resolved?.mode,
		root:
			typeof resolved?.envDir === 'string' ? resolved.envDir : resolved?.root,
	});
	const policy = (): ManifestBuildPolicy => ({
		command: command(),
		envNames: defaults.envNames,
		envSource: envSource(),
		// The mode is set in app code, which the plugin can't read.
		failureHint:
			" If the app passes manifest({ source: 'runtime' }) or an absolute manifest({ manifestUrl }), pass `source: 'runtime'` to this plugin so the build skips this download.",
		label: defaults.label,
		logger: logger(),
		onBuildError: options.onBuildError,
	});
	const fetchSnapshot = async (): Promise<ConsentManifest | undefined> => {
		try {
			const snapshot = await loadManifestForBuild(
				{ fetch: options.fetch, projectUrl },
				policy()
			);
			// Only a build knows the bundle uses `manifest()`: dev loads the
			// module for every mode.
			if (
				defaults.adviseHostedForLocation &&
				!serverRendered &&
				command() === 'build' &&
				snapshot &&
				manifestNeedsLocation(snapshot)
			) {
				logger().warn(LOCATION_ADVICE);
			}
			return snapshot;
		} catch (error) {
			generation = undefined;
			throw error;
		}
	};
	const loadSnapshot = (): Promise<ConsentManifest | undefined> => {
		generation ??= fetchSnapshot();
		return generation;
	};
	/**
	 * A bundle reads `projectUrl` but none is set: the hosted backend or
	 * `manifest()` without their own URL. Warns once rather than failing,
	 * because a mode that passes its own `projectUrl` still reads the
	 * build's as its default; one that does not throws when the app starts.
	 * A bundle that also reads the snapshot was already reported by its
	 * fetch.
	 */
	const reportMissingProjectUrl = (): void => {
		if (missingURLReported) {
			return;
		}
		missingURLReported = true;
		logger().warn(
			`no backend URL is set. A provider without \`projectUrl\`, and \`manifest()\` without its own, throw when the app starts. Pass projectUrl to the plugin or set ${defaults.envNames.join(' or ')}.`
		);
	};
	/** Warns once, for a multi-page app, why no page got the script. */
	const reportPrefetchSkipped = (reason: string): void => {
		// Only an app that asked for the script hears why it got none.
		if (prefetchSkipReported || options.initPrefetch === undefined) {
			return;
		}
		prefetchSkipReported = true;
		logger().warn(
			`initPrefetch: ${reason}, so index.html gets no \`/init\` script. It speeds up the hosted backend only.`
		);
	};
	/**
	 * Adds the `initPrefetch` script to `index.html`. A build runs this
	 * after `renderChunk`, so it knows whether the bundle reads the
	 * snapshot; dev can't tell, and always adds it.
	 */
	const addPrefetchScript = (html: string): string | undefined => {
		const { initPrefetch = true } = options;
		if (!initPrefetch || serverRendered) {
			return undefined;
		}
		if (!projectUrl) {
			if (options.initPrefetch !== undefined) {
				reportMissingProjectUrl();
			}
			return undefined;
		}
		if (runtimeOnly) {
			reportPrefetchSkipped(
				"`source: 'runtime'` means the app uses `manifest()`"
			);
			return undefined;
		}
		if (bundlesSnapshot) {
			reportPrefetchSkipped(
				'the bundle reads the snapshot, as `manifest()` does'
			);
			return undefined;
		}
		const prefetchOptions: PrefetchOptions =
			initPrefetch === true ? { projectUrl } : { ...initPrefetch, projectUrl };
		const script = `<script id="${PREFETCH_SCRIPT_ID}">${buildPrefetchScript(
			prefetchOptions
		)}</script>`;
		const end = prefetchScriptOffset(html);
		if (end === undefined) {
			return `${script}\n${html}`;
		}
		const lineStart = html.lastIndexOf('\n', end - 1) + 1;
		const indent = /^[\t ]*/u.exec(html.slice(lineStart))?.[0] ?? '';
		return `${html.slice(0, end)}\n${indent}${script}${html.slice(end)}`;
	};
	/**
	 * Whether this build puts the stock banner's stylesheets in its pages,
	 * and so gives `@inth/react` the sheets' deferred modules: a production
	 * client build of HTML pages that get the `/init` script.
	 */
	const staticBannerOn = (): boolean => {
		const { initPrefetch = true } = options;
		return (
			options.staticBanner !== false &&
			command() === 'build' &&
			!serverRendered &&
			htmlInput &&
			Boolean(initPrefetch) &&
			Boolean(projectUrl) &&
			!runtimeOnly
		);
	};
	let manifestForBanner: Promise<ConsentManifest | undefined> | undefined;
	const loadManifestForBanner = (): Promise<ConsentManifest | undefined> => {
		manifestForBanner ??= loadManifestForBuild(
			{ fetch: options.fetch, projectUrl },
			{
				...policy(),
				bestEffort: (reason) =>
					`staticBanner: could not fetch the consent manifest (${reason}), so index.html gets no static banner. The app renders its banner as before.`,
			}
		);
		return manifestForBanner;
	};
	/**
	 * Adds the banner's stylesheets to a page whose entry imports the stock
	 * banner, and the banner itself when the page got the `/init` script.
	 */
	const addStaticBanner = async (
		html: string,
		context: ManifestHtmlContext | undefined,
		prefetched: boolean
	): Promise<string | undefined> => {
		const { bundle, chunk } = context ?? {};
		if (!(chunk && bundle && staticBannerOn())) {
			return undefined;
		}
		const reactRoot = findPageBanner(chunk, bundle);
		const renderer = reactRoot
			? await loadStaticBannerRenderer(reactRoot)
			: undefined;
		if (!renderer) {
			return undefined;
		}
		const manifest = prefetched ? await loadManifestForBanner() : undefined;
		const language =
			/<html\s[^>]*\blang=["']?[a-z]{2,3}/iu
				.exec(html)?.[0]
				.slice(-3)
				.replace(/^[^a-z]/iu, '')
				.toLowerCase() ?? 'en';
		const banner = manifest
			? renderStaticBannerHtml(renderer, manifest, {
					language,
					storageKey:
						typeof options.initPrefetch === 'object'
							? options.initPrefetch.storageKey
							: undefined,
				})
			: undefined;
		return injectStaticBanner(html, {
			banner: banner?.html,
			sheets: renderStaticBannerSheets(renderer.STATIC_BANNER_SHEETS),
		});
	};
	return {
		apply: (_config: unknown, environment: { isPreview?: boolean }) =>
			!environment.isPreview,
		buildStart: () => {
			// `vite build --watch` reuses the plugin: each rebuild decides anew.
			bundlesSnapshot = false;
		},
		config(this, userConfig, env) {
			const base = {
				optimizeDeps: {
					exclude: [...generatedIds, ...(defaults.sourcePackages ?? [])],
				},
				ssr: { noExternal: [...importers] },
			};
			// Server-rendered adapters keep their framework's chunking.
			if (
				// A function decides once the config is resolved; see
				// `configResolved`.
				defaults.serverRendered === true ||
				!shouldGroupConsentChunks(
					this as ConsentManifestConfigContext | undefined,
					userConfig,
					env
				)
			) {
				return base;
			}
			return {
				...base,
				...consentChunkGroupsConfig(userConfig, [CONSENT_CHUNK_GROUP]),
			};
		},
		configResolved: (config: ManifestPluginConfig) => {
			resolved = config;
			// The resolved inputs, after every plugin's `config` hook: a
			// framework plugin that builds its own entries sets them there.
			htmlInput = !config.build?.ssr && buildsHtml(config);
			// An unknown `onBuildError` is a setup mistake: report it now, not
			// only when a bundle reads the snapshot.
			resolveManifestBuildErrorMode(
				options.onBuildError,
				defaults.label,
				envSource()
			);
			if (
				options.source !== undefined &&
				options.source !== 'build' &&
				!runtimeOnly
			) {
				throw new Error(
					`${defaults.label}: source must be 'build' or 'runtime', received ${JSON.stringify(options.source)}.`
				);
			}
			const { serverRendered: rendered = false } = defaults;
			serverRendered =
				typeof rendered === 'function' ? rendered(config) : rendered;
			if (serverRendered && typeof rendered === 'function') {
				// Server-rendered adapters keep their framework's chunking.
				dropConsentChunkGroup(config);
			}
			if (serverRendered && options.initPrefetch) {
				logger().warn(
					'initPrefetch has no effect in a server-rendered app, which resolves consent on the server.'
				);
			}
			projectUrl =
				options.projectUrl ?? readBuildEnv(defaults.envNames, envSource());
			const exposed = defaults.envNames.find((name) =>
				name.startsWith('VITE_')
			);
			if (projectUrl && exposed && config.env && !config.env[exposed]) {
				config.env[exposed] = projectUrl;
			}
		},
		enforce: 'pre' as const,
		async load(
			this: ManifestPluginContext | undefined,
			id: string,
			loadOptions?: { ssr?: boolean }
		): Promise<string | undefined> {
			if (id !== VIRTUAL_GENERATED_ID) {
				return undefined;
			}
			if (!resolved) {
				throw new Error(
					`${defaults.label}: Vite loaded ${GENERATED_MODULE_ID} before the plugin read its configuration.`
				);
			}
			const consumer =
				this?.environment?.config?.consumer ??
				(loadOptions?.ssr ? 'server' : 'client');
			const clientStub = serverRendered && consumer === 'client';
			if (command() === 'dev') {
				return renderGeneratedModule(
					{
						projectUrl,
						snapshot:
							clientStub || runtimeOnly ? undefined : await loadSnapshot(),
					},
					{ clientStub }
				);
			}
			let snapshotLine = `export const snapshot = ${placeholderExpression(PLACEHOLDERS.snapshot)};`;
			if (clientStub) {
				snapshotLine =
					'// The snapshot stays on the server; the browser bundle never gets it.\nexport const snapshot = undefined;';
			} else if (runtimeOnly) {
				snapshotLine =
					"// source: 'runtime': the app reads the manifest at runtime.\nexport const snapshot = undefined;";
			}
			const lines = [
				'// Written by the Inth build integration. Do not edit.',
				'// The build fills in what the bundle still reads after tree-shaking.',
				`export const projectUrl = ${
					projectUrl === undefined
						? placeholderExpression(PLACEHOLDERS.projectUrl)
						: JSON.stringify(projectUrl)
				};`,
				snapshotLine,
				'',
			];
			return lines.join('\n');
		},
		name: 'inth:consent-manifest',
		options: dialogChunks.options,
		outputOptions: dialogChunks.outputOptions,
		async renderChunk(code: string) {
			const readsSnapshot = code.includes(PLACEHOLDERS.snapshot);
			const readsProjectUrl = code.includes(PLACEHOLDERS.projectUrl);
			if (!(readsSnapshot || readsProjectUrl)) {
				return null;
			}
			let rendered = code;
			if (readsSnapshot) {
				bundlesSnapshot = true;
				const snapshot = await loadSnapshot();
				// One line, so the chunk's line mappings stay valid.
				rendered = rendered.replace(
					placeholderPattern(PLACEHOLDERS.snapshot),
					snapshot ? `(${JSON.stringify(snapshot)})` : 'void 0'
				);
			}
			if (readsProjectUrl) {
				if (!readsSnapshot) {
					reportMissingProjectUrl();
				}
				rendered = rendered.replace(
					placeholderPattern(PLACEHOLDERS.projectUrl),
					'void 0'
				);
			}
			if (
				Object.values(PLACEHOLDERS).some((token) => rendered.includes(token))
			) {
				throw new Error(
					`${defaults.label}: the bundler rewrote the ${GENERATED_MODULE_ID} stand-ins, so the build cannot fill them in.`
				);
			}
			return { code: rendered, map: null };
		},
		resolveId(
			this: unknown,
			id: string,
			importer?: string,
			resolveOptions?: { ssr?: boolean }
		): Promise<string | undefined> | string | undefined {
			if (generatedIds.includes(id)) {
				return VIRTUAL_GENERATED_ID;
			}
			const context = this as ManifestPluginResolveContext | undefined;
			const clientBanner = clientBannerPath(id, importer);
			if (
				clientBanner &&
				staticBannerOn() &&
				!resolveOptions?.ssr &&
				context?.environment?.config?.consumer !== 'server'
			) {
				// Pages with the static banner load the stock banner's code
				// after the page's own.
				return clientBanner;
			}
			const deferred = deferredSheetSpecifier(id, importer);
			if (
				!(
					deferred &&
					context?.resolve &&
					(serverRendered || staticBannerOn())
				) ||
				resolveOptions?.ssr ||
				context.environment?.config?.consumer === 'server'
			) {
				return undefined;
			}
			// A `@inth/sdk/ui` without the deferred module keeps the sheet's text.
			return (async () =>
				(await context.resolve?.(deferred, importer, { skipSelf: true }))
					?.id)();
		},
		async transformIndexHtml(
			html: string,
			context?: ManifestHtmlContext
		): Promise<string | undefined> {
			const prefetched = addPrefetchScript(html);
			const withBanner = await addStaticBanner(
				prefetched ?? html,
				context,
				prefetched !== undefined
			);
			return withBanner ?? prefetched;
		},
	};
};

/**
 * Serves the deployment's consent manifest as `@inth/sdk/generated`, for
 * single-page apps (React, Solid, plain JavaScript). Import `snapshot` from
 * there; no file is written into the app. The manifest is fetched only when
 * the bundle reads `snapshot`, as `manifest()` does, so hosted and
 * testing builds never depend on the backend.
 *
 * A failed fetch stops `vite build` and warns in `vite dev`, where
 * `snapshot` is `undefined`. Set `onBuildError` or `INTH_ON_BUILD_ERROR` to
 * change that. When the policy depends on the visitor's location, it warns
 * and suggests the hosted backend, since the browser's `manifest()` then still asks
 * the backend's `/init` unless the page passes `inputs` or `geoUrl`. With
 * an absolute `manifest({ manifestUrl })` or
 * `manifest({ source: 'runtime' })`, pass `source: 'runtime'` here too, so
 * the build never fetches a snapshot the app would discard.
 *
 * @param options - Backend URL, `onBuildError` and `source`. `projectUrl`
 * defaults to `VITE_INTH_PROJECT_URL`.
 * @returns A Vite plugin, compatible with React, Vue, Svelte and Solid builds.
 * @throws {Error} When the fetch fails in `'fail'` mode, stopping Vite.
 * @example
 * ```ts
 * import { consentManifest } from '@inth/sdk/build';
 * // Reads VITE_INTH_PROJECT_URL, for example from `.env`.
 * export default { plugins: [consentManifest()] };
 * ```
 */
export const consentManifest = (
	options: ConsentManifestPluginOptions = {}
): ConsentManifestPlugin =>
	createConsentManifestPlugin(options, {
		adviseHostedForLocation: true,
		envNames: ['VITE_INTH_PROJECT_URL'],
		label: '@inth/sdk/build',
	});
