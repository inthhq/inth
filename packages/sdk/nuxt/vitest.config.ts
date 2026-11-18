import { resolve } from 'node:path';

import { mergeConfig } from 'vitest/config';

import vueConfig from '../vue/vitest.config';

// The module's tests exercise @inth/vue's runtime sources next to it, with
// the same aliases, plus the Nitro virtuals this package's server runtime
// reads.
export default mergeConfig(vueConfig, {
	resolve: {
		alias: {
			'#@inth/sdk/build-options': resolve(
				__dirname,
				'./src/__tests__/build-options-virtual.ts'
			),
			'#@inth/sdk/server-app-config': resolve(
				__dirname,
				'./src/__tests__/server-app-config.ts'
			),
			'#inth/legacy-project-url-env': resolve(
				__dirname,
				'./src/__tests__/legacy-project-url-env-virtual.ts'
			),
			'#inth/manifest-snapshot': resolve(
				__dirname,
				'../vue/src/__tests__/manifest-snapshot.ts'
			),
			'@inth/vue/nuxt': resolve(__dirname, '../vue/src/nuxt.ts'),
		},
	},
	test: {
		coverage: {
			thresholds: { branches: 0, functions: 0, lines: 0, statements: 0 },
		},
	},
});
