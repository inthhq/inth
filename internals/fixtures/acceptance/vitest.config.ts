import { configDefaults, defineConfig } from 'vite-plus';

export default defineConfig({
	test: {
		// Vitest v4 compatibility: preserve mock call history.
		// Remove after tests no longer rely on calls from setup or earlier tests.
		// https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
		// https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
		clearMocks: false,
		coverage: { enabled: false },
		environment: 'node',
		exclude: [...configDefaults.exclude, 'src/starters.test.ts'],
		expect: { poll: { interval: 50, timeout: 5000 } },
		fileParallelism: false,
		hookTimeout: 600_000,
		include: ['src/**/*.test.ts'],
		testTimeout: 60_000,
	},
});
