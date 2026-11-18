import type { ConsentConfig } from './runtime/config';

// The runtime config the Nuxt module (@inth/nuxt) writes and this package's
// Nuxt plugins read. The `c15t` key of `nuxt.config.ts` is typed in
// @inth/nuxt.
declare module 'nuxt/schema' {
	interface PublicRuntimeConfig {
		c15t?: Omit<Partial<ConsentConfig>, 'projectUrl'> & {
			/** The `projectUrl` option. `NUXT_PUBLIC_C15T_BACKEND_URL` replaces it. */
			backendURL?: string;
		};
	}
}

export {};
