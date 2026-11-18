import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import bundleAnalyzer from '@next/bundle-analyzer';

const projectDir = dirname(fileURLToPath(import.meta.url));
// Turbopack reads node_modules at the repository root.
const repositoryRoot = resolve(projectDir, '../..');

/**
 * The bundle benchmark builds this fixture against both the base and the
 * head revision with the same fixture files. When a PR renames the
 * `@inth/nextjs` API, one side cannot compile the other's imports, so the
 * fixture imports a thin adapter and this overwrites it with the variant
 * the installed package exports. The tracked adapter is the `current`
 * copy so type-checking works without a build. Drop `legacy/` once every
 * measured base ships `ConsentRoot`.
 */
const selectConsentApi = function selectConsentApi(): void {
	// Read the workspace package directly: `@inth/nextjs` resolves to it on
	// both revisions, and its `exports` map has no `./package.json` entry to
	// resolve through. Turbo builds it before this fixture.
	const types = join(
		repositoryRoot,
		'packages/sdk/nextjs/dist-types/index.d.ts'
	);
	const variant =
		existsSync(types) && readFileSync(types, 'utf8').includes('ConsentRoot')
			? 'current'
			: 'legacy';
	const adapters = join(projectDir, 'app/nextjs-ssr/consent-api');
	for (const file of ['root.tsx', 'server.ts']) {
		copyFileSync(join(adapters, variant, file), join(adapters, file));
	}
};

selectConsentApi();

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === 'true',
	openAnalyzer: true,
});

const transpilePackages = [
	'@inth/benchmarking',
	'@inth/react',
	'@inth/nextjs',
	'@inth/sdk',
];

const config = {
	transpilePackages,
	turbopack: {
		root: repositoryRoot,
	},
};

export default withBundleAnalyzer(config);
