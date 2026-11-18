import { defineBuildConfig } from 'unbuild';

import { writeTranslationEntries } from '../shared/write-translation-entries.mjs';

// nuxt-module-build builds src/module. These re-export @inth/vue entries,
// so a Nuxt app imports everything from @inth/nuxt: one module per
// component, since @inth/vue marks its `.vue` files as having side effects
// and a barrel would keep every component in the bundle.
export default defineBuildConfig({
	entries: [
		'./src/testing',
		'./src/devtools',
		'./src/engine',
		{
			builder: 'mkdist',
			input: './src/components',
			outDir: './dist/components',
		},
	],
	externals: ['@inth/vue', '@inth/sdk'],
	hooks: {
		// Before unbuild checks that every export map target exists.
		'rollup:done'() {
			writeTranslationEntries('dist');
		},
	},
});
