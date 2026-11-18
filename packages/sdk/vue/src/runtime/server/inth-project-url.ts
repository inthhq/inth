/**
 * Applies `NUXT_PUBLIC_INTH_PROJECT_URL` on a running server, the way Nuxt
 * applies `NUXT_PUBLIC_INTH_PROJECT_URL` over `runtimeConfig.public`. Nuxt
 * maps environment variables by key path, so the Inth name needs this step.
 *
 * The module registers the plugin only when the build's backend URL came
 * from neither the `projectUrl` option nor `NUXT_PUBLIC_INTH_PROJECT_URL`,
 * so both still win.
 *
 * @internal
 */

/** The part of the runtime config the step reads and writes. */
export interface InthRuntimeConfig {
	public: { inth?: { backendURL?: string } };
}

/**
 * Sets `public.inth.backendURL` from `NUXT_PUBLIC_INTH_PROJECT_URL` when
 * `NUXT_PUBLIC_INTH_PROJECT_URL` is unset. Empty values count as unset.
 *
 * @param runtimeConfig - The request's runtime config, changed in place.
 * @param env - The server's environment variables.
 */
export const applyInthProjectURL = function applyInthProjectURL(
	runtimeConfig: InthRuntimeConfig,
	env: Record<string, string | undefined>
): void {
	const inth = env.NUXT_PUBLIC_INTH_PROJECT_URL;
	if (!inth || env.NUXT_PUBLIC_INTH_PROJECT_URL || !runtimeConfig.public.inth) {
		return;
	}
	runtimeConfig.public.inth.backendURL = inth;
};
