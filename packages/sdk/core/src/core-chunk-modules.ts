/**
 * Core modules that framework build plugins place by name when they split
 * an app's bundle into chunks. Each is a path inside core's `src` without
 * its extension; the bundleless build writes it to the same path under
 * `dist`. `core-chunk-modules.test.ts` checks that each file exists, so moving
 * one fails core's tests instead of silently changing a framework's chunks.
 */
export const CORE_CHUNK_MODULES = {
	/** The resolver `manifest({ resolve: 'browser' })` loads at startup. */
	browserResolver: 'transports/manifest-browser',
	/** The experiment controller a first banner can wait for. */
	experimentAssignment: 'libs/experiment-assignment',
	/** The IAB banner's purpose summary. */
	iabBannerSummary: 'libs/iab-banner-summary',
	/** The script loader and network blocker. */
	loaderAndBlocker: 'modules/loader-and-blocker',
} as const;

/** The core modules every stock surface reads to render. */
export const CORE_SURFACE_CONFIG_MODULES = [
	'libs/experiment-presentation',
	'libs/policy-actions',
] as const;

/**
 * The small core modules a framework root's first load shares with the
 * consent engine: the consent, vendor, experiment and policy helpers the
 * surfaces read, what records a tap before the engine, and the default
 * copy. The engine's own vendor resolution, experiment assignment, record
 * evaluation and cookie writes are not here.
 */
export const CORE_FIRST_LOAD_MODULES = [
	...CORE_SURFACE_CONFIG_MODULES,
	'consent-record/types',
	'consent/consent-types',
	'derive-surface',
	'libs/has',
	'libs/is-production',
	'libs/storage-keys',
	'libs/vendor-listing',
	'modules/vendor-allowed',
	'modules/vendor-denial',
	'surface-actions/instant-commit',
	'surface-actions/instant-commit.store',
	'translations/defaults',
] as const;

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * A regular expression source that matches the files of the given core
 * modules, from the folder that holds core: `core/dist/<module>.js` as
 * built, or `core/src/<module>.ts` in a linked checkout. Prefix it with
 * where core sits, such as `@inth/sdk/lib/` in an install.
 *
 * @param modules - Paths from {@link CORE_CHUNK_MODULES},
 * {@link CORE_SURFACE_CONFIG_MODULES} or {@link CORE_FIRST_LOAD_MODULES}.
 */
export const coreModulePattern = function coreModulePattern(
	modules: readonly string[]
): string {
	const paths = modules
		.map((module) => escapeRegExp(module).replaceAll('/', '[\\\\/]'))
		.join('|');
	return `core[\\\\/](?:dist|src)[\\\\/](?:${paths})\\.[cm]?[jt]s$`;
};

/**
 * The end of a core module's built path, `/core/dist/<module>.js`, for
 * matching a bundle manifest's source paths.
 */
export const coreModuleFile = (module: string): string =>
	`/core/dist/${module}.js`;
