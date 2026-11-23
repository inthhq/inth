/**
 * Nitro plugin: ignores runtime overrides of what the build fixed, through
 * `NUXT_PUBLIC_INTH_MODE_TYPE`, `NUXT_PUBLIC_INTH_MODE_RESOLVE` and
 * `NUXT_PUBLIC_INTH_ROUTE_PREFIX`. When a request's runtime config no
 * longer matches the build, it warns once per option and gives that config
 * the built values back before Nuxt renders or the consent route answers,
 * so the browser (through the payload) runs what the build made. Other mode
 * fields, such as `NUXT_PUBLIC_INTH_MODE_MANIFEST_URL`, still apply. See
 * `./build-options.model`.
 */
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime';

import built from '#@inth/sdk/build-options';

import {
	buildOptionVariable,
	createBuildOptionsGuard,
	readBuiltOption,
} from './build-options.model';
import type { BuiltOptionsRuntimeConfig } from './build-options.model';

export default defineNitroPlugin((nitroApp) => {
	// Every request, not once at startup: Cloudflare and similar platforms
	// apply environment bindings per request, after this plugin runs.
	const guard = createBuildOptionsGuard(built, (name) => {
		const label = name === 'routePrefix' ? name : `mode.${name}`;
		console.warn(
			`[@inth/vue] ${buildOptionVariable(name)} is ignored: the build fixed \`inth.${label}\` as ${JSON.stringify(readBuiltOption(built, name) ?? null)}. Set it in nuxt.config.ts and rebuild.`
		);
	});
	nitroApp.hooks.hook('request', (event) => {
		guard(useRuntimeConfig(event) as unknown as BuiltOptionsRuntimeConfig);
	});
});
