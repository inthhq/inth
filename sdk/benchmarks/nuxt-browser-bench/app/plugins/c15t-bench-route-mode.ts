/**
 * One build, one mode per bench route. An app sets `mode` in
 * `nuxt.config.ts` only; the bench swaps it in this request's runtime
 * config (a copy per request on the server, and per page load in the
 * browser) before the c15t plugin reads it. The build mode is `manifest()`,
 * so the consent route exists for the manifest routes.
 */
export default defineNuxtPlugin({
	enforce: 'pre',
	name: 'c15t-bench-route-mode',
	setup() {
		const getRoute = useRoute;
		const getRuntimeConfig = useRuntimeConfig;
		const route = getRoute();
		const c15t = getRuntimeConfig().public.c15t as {
			consentCategories?: string[];
			mode?: Record<string, unknown>;
		};
		const built = c15t.mode ?? { type: 'manifest' };
		if (route.path === '/client-manifest') {
			c15t.mode = {
				...built,
				// Match the German visitor used by the fixture's /init response.
				// Without a location, browser resolution falls back to /init.
				inputs: { country: 'DE', language: 'en', region: 'BE' },
				resolve: 'browser',
			};
		} else if (route.path === '/gate') {
			// The consent gate mirrors CookieBench's Nuxt fixture: the built
			// manifest() mode with server resolution and three categories.
			c15t.consentCategories = ['necessary', 'measurement', 'marketing'];
		} else if (route.path !== '/ssr-manifest') {
			c15t.mode = { type: 'hosted' };
		}
	},
});
