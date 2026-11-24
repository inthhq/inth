import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite-plus';

export default defineConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	test: {
		// Vitest v4 compatibility: preserve mock call history.
		// Remove after tests no longer rely on calls from setup or earlier tests.
		// https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
		// https://vitest.dev/guide/migration/#clearmocks-is-enabled-by-default
		clearMocks: false,
		environment: 'node',
		hookTimeout: 60_000,
		include: ['tests/**/*.test.ts'],
		testTimeout: 30_000,
	},
});
