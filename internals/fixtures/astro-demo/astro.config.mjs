/**
 * Picks the configuration for this build.
 *
 * `astro.server.config.mjs` and `astro.static.config.mjs` mirror the starters in
 * `examples/astro` and `examples/astro-static`, plus the vendor scenario, and
 * the example suite builds each of them against a backend:
 *
 *   INTH_PROJECT_URL=https://your-project.inth.app bun run --cwd internals/fixtures/astro-demo build
 *   INTH_PROJECT_URL=https://your-project.inth.app INTH_ASTRO_OUTPUT=static bun run --cwd internals/fixtures/astro-demo build
 *
 * Without a backend URL, or with `INTH_IAB`, `INTH_UI` or `INTH_EXPERIMENT`
 * set, the showcase build runs instead. See `astro.showcase.config.mjs`.
 */
const showcase =
	!process.env.INTH_PROJECT_URL ||
	process.env.INTH_IAB === '1' ||
	process.env.INTH_EXPERIMENT === '1' ||
	Boolean(process.env.INTH_UI);

const load = async function load() {
	if (showcase) {
		return (await import('./astro.showcase.config.mjs')).default;
	}
	if (process.env.INTH_ASTRO_OUTPUT === 'static') {
		return (await import('./astro.static.config.mjs')).default;
	}
	const config = (await import('./astro.server.config.mjs')).default;
	// Server islands need an adapter, so only the server build gets the
	// cached-page route.
	config.integrations.push({
		hooks: {
			'astro:config:setup': ({ injectRoute }) => {
				injectRoute({
					entrypoint: './src/server-routes/consent-example-cached.astro',
					pattern: '/consent-example-cached',
				});
			},
		},
		name: 'astro-demo:cached-route',
	});
	return config;
};

export default await load();
