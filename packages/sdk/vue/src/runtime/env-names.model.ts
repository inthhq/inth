/**
 * The variables that carry the backend URL. Builds also read their c15t
 * names, through `legacyEnvName` from `@inth/sdk/build`.
 *
 * @internal
 */

/** Read by `consentManifest()` from `@inth/vue/vite`. */
export const VITE_PROJECT_URL_ENV = 'VITE_INTH_PROJECT_URL';

/** Applied by Nuxt to `runtimeConfig.public.inth.projectUrl`. */
export const NUXT_PROJECT_URL_ENV = 'NUXT_PUBLIC_INTH_PROJECT_URL';

/** Applied by Nuxt to the private `runtimeConfig.inth.projectUrl`. */
export const NUXT_SERVER_PROJECT_URL_ENV = 'NUXT_INTH_PROJECT_URL';
