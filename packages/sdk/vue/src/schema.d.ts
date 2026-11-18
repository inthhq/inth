import type { ConsentConfig } from './runtime/config';

// The runtime config the Nuxt module (@inth/nuxt) writes and this package's
// Nuxt plugins read. The `inth` key of `nuxt.config.ts` is typed in
// @inth/nuxt.
declare module 'nuxt/schema' {
	interface PublicRuntimeConfig {
		/** `NUXT_PUBLIC_INTH_PROJECT_URL` replaces `projectUrl`. */
		inth?: Partial<ConsentConfig>;
	}
}

export {};
