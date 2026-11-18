import type { NextConfig } from 'next';

const transpilePackages = [
	'@c15t/benchmarking',
	'@inth/react',
	'@inth/nextjs',
	'@inth/sdk',
];

const config: NextConfig = {
	transpilePackages,
};

export default config;
