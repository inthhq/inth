import { baseConfig } from '@inth/vitest-config/base';
import { defineConfig, mergeConfig } from 'vite-plus';

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			environment: 'node',
			include: ['src/**/*.test.ts'],
		},
	})
);
