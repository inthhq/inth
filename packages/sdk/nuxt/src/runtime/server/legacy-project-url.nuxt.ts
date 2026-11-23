/**
 * Nitro plugin: applies the c15t project URL variables to each request's
 * runtime config before Nuxt renders or the consent route answers, so the
 * server render, the route and the browser (through the payload) read one
 * value. See `./apply-legacy-project-url`.
 */
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime';

import variables from '#inth/legacy-project-url-env';

import { applyLegacyProjectUrl } from './apply-legacy-project-url';
import type { LegacyProjectUrlRuntimeConfig } from './apply-legacy-project-url';

export default defineNitroPlugin((nitroApp) => {
	const env = globalThis.process?.env ?? {};
	if (!variables.some(({ legacy }) => env[legacy])) {
		return;
	}
	nitroApp.hooks.hook('request', (event) => {
		applyLegacyProjectUrl(
			useRuntimeConfig(event) as unknown as LegacyProjectUrlRuntimeConfig,
			env,
			variables
		);
	});
});
