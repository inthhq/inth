import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { withConsentManifest } from '@c15t/nextjs/build';
import type { NextConfig } from 'next';

const projectDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(projectDir, '../..');

const transpilePackages = [
	'@c15t/benchmarking',
	'@c15t/iab',
	'@c15t/react',
	'@c15t/nextjs',
	'@c15t/core',
];

const config: NextConfig = {
	transpilePackages,
	turbopack: {
		root: monorepoRoot,
	},
};

// Wrapped as the Next.js quickstart and CookieBench's Next.js fixture wrap
// it, so browser bundles get what the documented setup gives them (the
// deferred first-paint sheets on a release that has them). The routes pass
// their config to `ConsentRoot` and resolve the manifest at runtime, so the
// build fetches nothing and does not need the bench backend running.
// The cast bridges this bench's Next.js types and the dev copy the adapter is
// typed against in the workspace; an app has one copy.
export default withConsentManifest(
	config as Parameters<typeof withConsentManifest>[0],
	{ onBuildError: 'runtime' }
);
