import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const projectDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(projectDir, '../..');

const transpilePackages = [
	'@inth/benchmarking',
	'@inth/react',
	'@inth/nextjs',
	'@inth/sdk',
];

const config: NextConfig = {
	transpilePackages,
	turbopack: {
		root: monorepoRoot,
	},
};

export default config;
