import type { ConsentManifest } from '@inth/sdk-schema/types';

import { readApiError } from '../transports/v1/inth-api-error';
import { V1_ROUTES } from '../transports/v1/v1-routes';

/** Names that parse but cannot be bound with `export const`. */
const RESERVED_EXPORT_NAMES = new Set([
	'arguments',
	'await',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'eval',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'function',
	'if',
	'implements',
	'import',
	'in',
	'instanceof',
	'interface',
	'let',
	'new',
	'null',
	'package',
	'private',
	'protected',
	'public',
	'return',
	'static',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'typeof',
	'var',
	'void',
	'while',
	'with',
	'yield',
]);

/** Options shared by framework build-time manifest generators. */
export interface StaticManifestModuleOptions {
	manifestUrl: string;
	fetch?: typeof globalThis.fetch;
	exportName?: string;
	importSource?: string;
}

/** Fetches a manifest for build-time code generation.
 * @param label - Framework name used in errors.
 * @throws {Error} When fetch is unavailable or the response is not a valid manifest.
 */
export const loadStaticManifest = async (
	options: Pick<StaticManifestModuleOptions, 'manifestUrl' | 'fetch'>,
	label: string
): Promise<ConsentManifest> => {
	const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
	if (!fetchImpl) {
		throw new Error(`${label}: no fetch available.`);
	}
	const response = await fetchImpl(options.manifestUrl, {
		headers: { accept: 'application/json' },
		method: 'GET',
	});
	if (!response.ok) {
		throw await readApiError(`${label}: ${V1_ROUTES.manifest}`, response);
	}
	try {
		// Build/static loading owns validation; request resolvers need no schemas.
		const { parseConsentManifest } = await import('@inth/sdk-schema');
		return parseConsentManifest(await response.json());
	} catch (cause) {
		throw new Error(
			`${label}: ${V1_ROUTES.manifest} returned an invalid consent manifest.`,
			{
				cause,
			}
		);
	}
};

/**
 * Validates the identifiers a generated manifest module uses.
 * @returns The export name and import source to write.
 * @throws {Error} When either identifier is invalid.
 * @internal
 */
const resolveStaticManifestModuleNames = (
	options: Pick<StaticManifestModuleOptions, 'exportName' | 'importSource'>,
	defaults: { importSource: string; label: string }
): { exportName: string; importSource: string } => {
	const exportName = options.exportName ?? 'consentManifest';
	if (
		!/^[A-Za-z_$][\w$]*$/u.test(exportName) ||
		RESERVED_EXPORT_NAMES.has(exportName)
	) {
		throw new Error(
			`${defaults.label}: exportName must be a valid identifier, received ${JSON.stringify(exportName)}.`
		);
	}
	const importSource = options.importSource ?? defaults.importSource;
	if (!/^[A-Za-z0-9@_./+~-]+$/u.test(importSource)) {
		throw new Error(
			`${defaults.label}: importSource must be a module specifier, received ${JSON.stringify(importSource)}.`
		);
	}
	return { exportName, importSource };
};

/**
 * Renders a generated manifest module. Without a manifest, the export is
 * `undefined` with the same `ConsentManifest` type, so imports still compile
 * and the server fetches the manifest at runtime.
 * @param manifest - The snapshot, or `undefined` when the build has none.
 * @returns TypeScript source for the module.
 * @internal
 */
const renderStaticManifestModule = (
	names: { exportName: string; importSource: string },
	manifest: ConsentManifest | undefined
): string =>
	[
		`import type { ConsentManifest } from '${names.importSource}';`,
		'',
		...(manifest
			? [
					`export const ${names.exportName} = ${JSON.stringify(manifest, null, 2)} as const satisfies ConsentManifest;`,
				]
			: [
					'// The build did not fetch the manifest, so the server fetches it at runtime.',
					`export const ${names.exportName}: ConsentManifest | undefined = undefined;`,
				]),
		'',
	].join('\n');

/** Generates a typed module with validated export and import names.
 * @returns TypeScript source containing the manifest.
 * @throws {Error} When a generated identifier is invalid or the fetch fails.
 */
export const createStaticManifestModule = async (
	options: StaticManifestModuleOptions,
	defaults: { importSource: string; label: string }
): Promise<string> => {
	const names = resolveStaticManifestModuleNames(options, defaults);
	const manifest = await loadStaticManifest(options, defaults.label);
	return renderStaticManifestModule(names, manifest);
};

/** What a framework's `/static` entry exports for build-time manifests. */
export interface StaticManifestEntry {
	/** Fetches the manifest used by static builds. */
	loadStaticManifest: (
		options: Pick<StaticManifestModuleOptions, 'manifestUrl' | 'fetch'>
	) => Promise<ConsentManifest>;
	/** Generates a typed manifest module for a static build. */
	createStaticManifestModule: (
		options: StaticManifestModuleOptions
	) => Promise<string>;
}

/**
 * The build-time manifest helpers of a framework's `/static` entry, which
 * names itself in errors and as the generated module's type import.
 *
 * @param entry - The entry's specifier, such as `@inth/nextjs/static`.
 * @returns `loadStaticManifest` and `createStaticManifestModule`.
 * @example
 * ```ts
 * export const { createStaticManifestModule, loadStaticManifest } =
 *   createStaticManifestEntry('@inth/nextjs/static');
 * ```
 */
export const createStaticManifestEntry = (
	entry: string
): StaticManifestEntry => ({
	createStaticManifestModule: (options) =>
		createStaticManifestModule(options, { importSource: entry, label: entry }),
	loadStaticManifest: (options) => loadStaticManifest(options, entry),
});
