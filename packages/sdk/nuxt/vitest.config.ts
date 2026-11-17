import { mergeConfig } from 'vitest/config';

import vueConfig from '../vue/vitest.config';

// The module's tests exercise @inth/vue's runtime sources next to it, with
// the same aliases.
export default mergeConfig(vueConfig, {
	test: {
		coverage: {
			thresholds: { branches: 0, functions: 0, lines: 0, statements: 0 },
		},
	},
});
