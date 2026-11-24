import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite-plus';

export default defineConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	test: {
		environment: 'node',
		include: ['lib/**/*.test.ts'],
	},
});
