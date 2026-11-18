import type { ModuleOptions } from './nuxt-options';

// `app.config.ts` is typed by the `CustomAppConfig` and `AppConfigInput`
// augmentations in `module.ts`, which ship with the module's declarations.
// @inth/vue types the public runtime config its Nuxt plugins read.
declare module 'nuxt/schema' {
	interface NuxtConfig {
		c15t?: ModuleOptions;
	}
}

export {};
