import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';

/**
 * Standard exclude patterns for rslib configuration files.
 * These patterns exclude test files and system files from the build.
 */
export const standardExcludePatterns = [
	'**/.DS_Store',
	'**/__tests__/**',
	'**/__snapshots__/**',
	'**/__screenshots__/**',
	'**/*.test.ts',
	'**/*.test.tsx',
	'**/*.spec.ts',
	'**/*.spec.tsx',
	'**/*.browser.test.ts',
	'**/*.e2e.test.ts',
	'**/*.e2e.test.tsx',
	'**/*.e2e.ts',
	'**/mockServiceWorker.js',
	'**/test-setup.*',
];

/**
 * Standard source entry globs for packages that build from `./src/**`.
 * The exclude patterns, negated, keep test and fixture files out when
 * bundlers process wildcard entries.
 */
export const standardSourceEntries = [
	'./src/**',
	...standardExcludePatterns.map((pattern) => `!./src/${pattern}`),
];

/**
 * Returns an array of RsdoctorRspackPlugin instances if WITH_RSDOCTOR environment variable is set,
 * otherwise returns an empty array.
 * This utility centralizes the Rsdoctor plugin configuration across all rslib configs.
 */
export const getRsdoctorPlugins = function getRsdoctorPlugins() {
	if (process.env.WITH_RSDOCTOR) {
		return [
			new RsdoctorRspackPlugin({
				disableClientServer: true,
				output: {
					mode: 'brief',
					options: {
						type: ['json'],
					},
				},
			}),
		];
	}
	return [];
};
