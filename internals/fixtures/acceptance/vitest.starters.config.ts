import { configDefaults, defineConfig } from 'vite-plus';

import base from './vitest.config';

export default defineConfig({
	...base,
	test: {
		...base.test,
		exclude: configDefaults.exclude,
		include: ['src/starters.test.ts'],
	},
});
