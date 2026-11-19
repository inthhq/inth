import type { NextConfig } from 'next';

const transpilePackages = [
	'@inth/benchmarking',
	'@inth/react',
	'@inth/nextjs',
	'@inth/sdk',
];

const config: NextConfig = {
	transpilePackages,
};

export default config;
