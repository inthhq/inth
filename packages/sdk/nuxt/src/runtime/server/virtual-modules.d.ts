/** The Nitro virtuals the module registers for its server routes and plugins. */

/** A Nitro virtual the module registers for its server plugin. */
declare module '#@inth/sdk/server-app-config' {
	/**
	 * The app's merged `app.config.ts`, or `undefined` when Nitro cannot load
	 * it because server auto-imports are off.
	 */
	export const useServerAppConfig: (
		event?: unknown
	) => Record<string, unknown> | undefined;
}

/** A Nitro virtual the module registers for its consent route. */
declare module '#inth/manifest-snapshot' {
	import type { ConsentManifest } from '@inth/sdk/schema/types';

	/** The server snapshot, or `undefined` without one. */
	const manifest: ConsentManifest | undefined;
	export default manifest;
}

/** A Nitro virtual the module registers for its build options plugin. */
declare module '#@inth/sdk/build-options' {
	import type { BuiltOptions } from './build-options';

	/** The `mode` and `routePrefix` the build used. */
	const built: BuiltOptions;
	export default built;
}

/** A Nitro virtual the module registers for its legacy project URL plugin. */
declare module '#inth/legacy-project-url-env' {
	import type { LegacyProjectUrlEnv } from './legacy-project-url';

	/** The c15t variables the server still applies. */
	const variables: readonly LegacyProjectUrlEnv[];
	export default variables;
}
