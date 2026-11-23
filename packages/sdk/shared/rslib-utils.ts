import { join } from 'node:path';

import type { Rspack } from '@rsbuild/core';
import { RsdoctorRspackPlugin } from '@rsdoctor/rspack-plugin';

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
 * With `WITH_RSDOCTOR` set, writes an Rsdoctor report for each build a
 * package runs to `.rsdoctor/<build>/rsdoctor-data.json`, the file
 * `rsdoctor-agent` reads. A package with several builds (core's
 * self-contained entries, the browser script tags) gets one report per build,
 * and the reports stay out of `dist/`, so they never reach a published
 * package.
 */
export const getRsdoctorPlugins = function getRsdoctorPlugins() {
	if (!process.env.WITH_RSDOCTOR) {
		return [];
	}
	return [
		{
			apply(compiler: Rspack.Compiler) {
				new RsdoctorRspackPlugin({
					disableClientServer: true,
					output: {
						mode: 'brief',
						options: {
							type: ['json'],
						},
						reportCodeType: { noCode: false },
						reportDir: join(
							compiler.context,
							'.rsdoctor',
							compiler.options.name ?? 'build'
						),
					},
				}).apply(compiler);
			},
		},
	];
};
