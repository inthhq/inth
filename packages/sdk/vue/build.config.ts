import { fileURLToPath } from 'node:url';

import { resolve } from 'pathe';
import { defineBuildConfig } from 'unbuild';

const dir = fileURLToPath(new URL('.', import.meta.url));

export default defineBuildConfig({
	alias: {
		'#imports': resolve(dir, 'src/runtime/vue/stubs.ts'),
	},
	declaration: true,
	entries: [
		'./src/vite',
		'./src/index',
		'./src/testing',
		'./src/devtools',
		'./src/postcss-tailwind3',
	],
	externals: [
		'vue',
		'vite',
		'@inth/sdk/schema',
		'@inth/sdk/ui',
		'@inth/sdk/engine',
		'@inth/sdk/devtools',
		'reka-ui',
		'defu',
		'ufo',
	],
});
