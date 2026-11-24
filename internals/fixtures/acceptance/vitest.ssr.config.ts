import { defineConfig } from 'vite-plus';

import base from './vitest.config';

export default defineConfig({
	...base,
	test: { ...base.test, include: ['src/ssr-journeys.test.mjs'] },
});
