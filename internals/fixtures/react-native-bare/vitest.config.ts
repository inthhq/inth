import { defineConfig } from 'vite-plus';

export default defineConfig({
	test: {
		coverage: { enabled: false },
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
