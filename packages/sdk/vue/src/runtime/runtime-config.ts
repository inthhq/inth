/**
 * The runtime config key that holds `projectUrl`. Nuxt applies
 * `NUXT_PUBLIC_C15T_BACKEND_URL` and `NUXT_C15T_BACKEND_URL` to the key
 * their names spell, so the module stores the option under `backendURL` and
 * readers map it back with {@link fromRuntimeConfig}.
 *
 * @internal
 */
export const PROJECT_URL_RUNTIME_KEY = 'backendURL';

/**
 * A `c15t` runtime config object with `backendURL` read back as
 * `projectUrl`.
 *
 * @param c15t - `runtimeConfig.public.c15t` or the private `runtimeConfig.c15t`.
 * @returns The same values under the option names.
 * @internal
 */
export const fromRuntimeConfig = function fromRuntimeConfig<T>(c15t: T): T {
	if (
		typeof c15t !== 'object' ||
		c15t === null ||
		!(PROJECT_URL_RUNTIME_KEY in c15t)
	) {
		return c15t;
	}
	const { [PROJECT_URL_RUNTIME_KEY]: projectUrl, ...rest } = c15t as Record<
		string,
		unknown
	>;
	return { ...rest, projectUrl } as T;
};
