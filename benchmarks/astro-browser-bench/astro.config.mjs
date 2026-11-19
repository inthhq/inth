import { fileURLToPath } from 'node:url';

import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import inth, { hosted, manifest } from '@inth/astro';
import { defineConfig } from 'astro/config';

/**
 * One app, three builds.
 *
 * Astro serializes the integration's options into a virtual module at build
 * time, so a page cannot pick its transport the way the Nuxt bench's route
 * plugin does. `INTH_BENCH_ASTRO_MODE` picks it instead, and the runner
 * builds each variant into its own `outDir` and serves the arms that belong
 * to it:
 *
 * - `manifest` (default) — `/ssr-manifest`, `/ssr-deferred`, `/repeat-visitor`
 * - `hosted` — `/ssr`, the direct-init arm that pays the backend RTT
 * - `baseline` — `/baseline`, built with no Inth integration at all, which
 *   is the zero-consent floor `consentTax = bannerVisible − floor` subtracts
 * - `scripts` — `/scripts`, `/repeat-visitor-scripts`: manifest mode plus
 *   one measurement-gated script and a network-blocker rule, so the runner
 *   can time when a consented script loads
 * - `gate` — `/gate`, the consent gate page (`scripts/run-gate.ts`): manifest
 *   mode with CookieBench's three categories and a `clientEntrypoint` that
 *   adds the two gated scripts, as CookieBench's Astro fixture configures it.
 *   Its control page is served from a `baseline` build.
 *
 * Absolute fixture URLs on purpose: the shared resolver assumes `https` for
 * a relative URL with no `x-forwarded-proto`, which a plain HTTP bench
 * server does not speak.
 *
 * The shipped `pre` middleware is registered as it would be on a real site.
 * It skips the integration's own init and manifest routes, so serving the
 * manifest from this same process does not make the manifest request
 * resolve consent, which would fetch the manifest, which would resolve
 * consent.
 */
const benchMode = process.env.INTH_BENCH_ASTRO_MODE ?? 'manifest';
const origin = process.env.INTH_BENCH_ORIGIN ?? 'http://127.0.0.1:4353';
const projectUrl = `${origin}/api/bench-consent`;

const consentCategories = [
	'necessary',
	'functionality',
	'experience',
	'measurement',
	'marketing',
];

const integrations = [svelte()];

if (benchMode === 'manifest' || benchMode === 'scripts') {
	const options = {
		consentCategories,
		// The fixture backend lives under `/api/bench-consent`, which the
		// integration does not know about; the manifest route it does
		// know about is skipped for it.
		middleware: { skip: ['/api/bench-consent'] },
		// The backend is this app, which isn't running during the build, and
		// the benchmark measures the runtime manifest path.
		mode: manifest({
			manifestUrl: `${projectUrl}/v1/consent/manifest`,
			source: 'runtime',
		}),
		projectUrl,
	};
	if (benchMode === 'scripts') {
		options.networkBlocker = {
			rules: [
				{
					category: 'measurement',
					domain: '127.0.0.1',
					pathIncludes: '/bench-beacon.txt',
				},
			],
		};
		options.scripts = [
			{
				category: 'measurement',
				id: 'bench-third-party',
				src: '/bench-third-party.js',
			},
		];
	}
	integrations.push(inth(options));
} else if (benchMode === 'gate') {
	integrations.push(
		inth({
			clientEntrypoint: fileURLToPath(
				new URL('src/gate-client.ts', import.meta.url)
			),
			consentCategories: ['necessary', 'measurement', 'marketing'],
			middleware: { skip: ['/api/bench-consent'] },
			mode: manifest({
				manifestUrl: `${projectUrl}/v1/consent/manifest`,
				source: 'runtime',
			}),
			projectUrl,
		})
	);
} else if (benchMode === 'hosted') {
	integrations.push(
		inth({
			consentCategories,
			middleware: { skip: ['/api/bench-consent'] },
			mode: hosted(),
			projectUrl,
		})
	);
}

export default defineConfig({
	adapter: node({ mode: 'standalone' }),
	integrations,
	outDir: process.env.INTH_BENCH_OUT_DIR ?? './dist',
	output: 'server',
});
