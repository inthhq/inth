import type { ConsentManifest } from '@inth/sdk/schema/types';
import {
	createStaticManifestModule as createModule,
	loadStaticManifest as loadManifest,
} from '@inth/sdk/server';

/** The manifest shape generated static modules are typed against. */
export type { ConsentManifest } from '@inth/sdk/schema/types';
export type {
	StaticConsentResolution,
	StaticConsentResolverOptions,
	StaticGeoResult,
} from '@inth/sdk/static';
export {
	createStaticConsentResolver,
	resolveUnknownLocationInit,
} from '@inth/sdk/static';

export interface StaticManifestModuleOptions {
	manifestUrl: string;
	fetch?: typeof globalThis.fetch;
	exportName?: string;
	/**
	 * Module the generated file imports its `ConsentManifest` type from.
	 * Use the entry the application itself depends on, so the import
	 * resolves under strict dependency layouts (pnpm): apps that install
	 * the umbrella package pass `'@inth/tanstack-start/static'`.
	 *
	 * @default '@inth/tanstack-start/static'
	 */
	importSource?: string;
}

/** Fetches the manifest used by static builds. */
export const loadStaticManifest = (
	options: Omit<StaticManifestModuleOptions, 'exportName'>
): Promise<ConsentManifest> =>
	loadManifest(options, '@inth/tanstack-start/static');

/** Generates a typed manifest module for a static build. */
export const createStaticManifestModule = (
	options: StaticManifestModuleOptions
): Promise<string> =>
	createModule(options, {
		importSource: '@inth/tanstack-start/static',
		label: '@inth/tanstack-start/static',
	});
