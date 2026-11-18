/**
 * The runtime config key that holds `projectUrl`. Nuxt applies
 * `NUXT_PUBLIC_INTH_PROJECT_URL` and `NUXT_INTH_PROJECT_URL` to the key
 * their names spell, so the module stores the option under `backendURL` and
 * readers map it back with {@link fromRuntimeConfig}.
 *
 * @internal
 */
export const PROJECT_URL_RUNTIME_KEY = 'backendURL';

/**
 * A `inth` runtime config object with `backendURL` read back as
 * `projectUrl`.
 *
 * @param Inth - `runtimeConfig.public.inth` or the private `runtimeConfig.inth`.
 * @returns The same values under the option names.
 * @internal
 */
export const fromRuntimeConfig = function fromRuntimeConfig<T>(inth: T): T {
	if (
		typeof inth !== 'object' ||
		inth === null ||
		!(PROJECT_URL_RUNTIME_KEY in inth)
	) {
		return inth;
	}
	const { [PROJECT_URL_RUNTIME_KEY]: projectUrl, ...rest } = inth as Record<
		string,
		unknown
	>;
	return { ...rest, projectUrl } as T;
};
