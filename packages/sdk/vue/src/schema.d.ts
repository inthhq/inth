import type { ConsentConfig } from './runtime/config';

// The runtime config the Nuxt module (@inth/nuxt) writes and this package's
// Nuxt plugins read. The `inth` key of `nuxt.config.ts` is typed in
// @inth/nuxt.
declare module 'nuxt/schema' {
	interface PublicRuntimeConfig {
		inth?: Omit<Partial<ConsentConfig>, 'projectUrl'> & {
			/** The `projectUrl` option. `NUXT_PUBLIC_INTH_PROJECT_URL` replaces it. */
			backendURL?: string;
		};
	}
}

export {};
