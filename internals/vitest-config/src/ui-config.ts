import { defineProject, mergeConfig } from 'vite-plus';

import { baseConfig } from './base-config';

export const uiConfig = mergeConfig(
	baseConfig,
	defineProject({
		test: {
			environment: 'jsdom',
		},
	})
);
