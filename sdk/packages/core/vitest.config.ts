/// <reference types="vitest" />
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Configuration for Node.js tests
export default defineConfig({
	resolve: {
		alias: {
			'~': resolve(__dirname, './src'),
		},
	},
	test: {
		globals: true,
		environment: 'node',
		include: ['**/__tests__/**/*.test.ts'],
		exclude: ['**/__tests__/**/*.browser.test.ts'],
		setupFiles: ['./vitest.setup.ts'],
		mockReset: false,
	},
});
