/** `@inth/tanstack-start/static`: build-time manifest helpers and the static resolver. */
import { createStaticManifestEntry } from '@inth/sdk/server';

export type { ConsentManifest } from '@inth/sdk/schema/types';
export type { StaticManifestModuleOptions } from '@inth/sdk/server';
export type {
	StaticConsentResolution,
	StaticConsentResolverOptions,
	StaticGeoResult,
} from '@inth/sdk/static';
export {
	createStaticConsentResolver,
	resolveUnknownLocationInit,
} from '@inth/sdk/static';

export const { createStaticManifestModule, loadStaticManifest } =
	createStaticManifestEntry('@inth/tanstack-start/static');
