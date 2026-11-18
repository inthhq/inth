/**
 * Applies the c15t names of the project URL variables on a running server,
 * as Nuxt applies `NUXT_PUBLIC_INTH_PROJECT_URL` and `NUXT_INTH_PROJECT_URL`
 * by key path. The Inth name wins when both are set.
 *
 * The module lists the public variable only when the build's URL came from
 * neither the `projectUrl` option nor `NUXT_PUBLIC_INTH_PROJECT_URL`, so
 * both still win.
 *
 * @internal
 */

/** A project URL variable Nuxt applies, and the c15t name it replaced. */
export interface LegacyProjectUrlEnv {
	/** `public` for `runtimeConfig.public.inth`, `server` for `runtimeConfig.inth`. */
	scope: 'public' | 'server';
	name: string;
	legacy: string;
}

/** The part of the runtime config the step reads and writes. */
export interface LegacyProjectUrlRuntimeConfig {
	inth?: { projectUrl?: string };
	public: { inth?: { projectUrl?: string } };
}

/**
 * Sets `projectUrl` from each legacy variable whose Inth name is unset.
 * Empty values count as unset.
 *
 * @param runtimeConfig - The request's runtime config, changed in place.
 * @param env - The server's environment variables.
 * @param variables - The variables to apply, from the module.
 */
export const applyLegacyProjectUrl = function applyLegacyProjectUrl(
	runtimeConfig: LegacyProjectUrlRuntimeConfig,
	env: Record<string, string | undefined>,
	variables: readonly LegacyProjectUrlEnv[]
): void {
	for (const { legacy, name, scope } of variables) {
		const value = env[legacy];
		const target =
			scope === 'public' ? runtimeConfig.public.inth : runtimeConfig.inth;
		if (value && !env[name] && target) {
			target.projectUrl = value;
		}
	}
};
