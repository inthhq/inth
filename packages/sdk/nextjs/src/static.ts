import type { ConsentManifest } from '@inth/sdk/schema/types';
import {
	createStaticManifestModule as createModule,
	loadStaticManifest as loadManifest,
} from '@inth/sdk/server';

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
	/** Package entry that supplies the generated ConsentManifest type. */
	importSource?: string;
}

/** Fetches the manifest used by static builds. */
export const loadStaticManifest = (
	options: Omit<StaticManifestModuleOptions, 'exportName'>
): Promise<ConsentManifest> => loadManifest(options, '@inth/nextjs/static');

/** Generates a typed manifest module for a static build. */
export const createStaticManifestModule = (
	options: StaticManifestModuleOptions
): Promise<string> =>
	createModule(options, {
		importSource: '@inth/nextjs/static',
		label: '@inth/nextjs/static',
	});
