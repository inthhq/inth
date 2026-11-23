/**
 * What `@inth/nuxt` shares with the Vue runtime its Nuxt plugins run on:
 * how the module's `mode` and `routePrefix` options read, the runtime
 * config the plugins merge, and the names both sides agree on. The Nuxt
 * module and its server routes import it; apps use `@inth/nuxt`.
 *
 * @packageDocumentation
 */
export {
	DEVTOOLS_ICON_ROUTE,
	DEVTOOLS_PAGE_ROUTE,
} from './runtime/devtools/devtools.model';
export {
	NUXT_PROJECT_URL_ENV,
	NUXT_SERVER_PROJECT_URL_ENV,
} from './runtime/env-names.model';
export type { RuntimeConsentConfig } from './runtime/kernel';
export { readNuxtMode, readNuxtRoutePrefix } from './runtime/nuxt-mode';
export type {
	NuxtConsentModeConfig,
	NuxtMode,
	NuxtResolvedModeConfig,
} from './runtime/nuxt-mode';
