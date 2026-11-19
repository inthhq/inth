// Import from the built declarations: the published tarball ships `dist` and
// `schema` only, so a `src` import would leave consumers' Nuxt schema type
// generation resolving a missing file.
import type { InthNuxtAppConfig, InthNuxtConfig } from '../dist/module.mjs';

export interface NuxtCustomSchema {
	appConfig?: {
		inth?: Partial<InthNuxtAppConfig>;
	};
	runtimeConfig?: {
		inth?: Partial<InthNuxtConfig>;
		public?: {
			inth?: Partial<InthNuxtConfig>;
		};
	};
}
