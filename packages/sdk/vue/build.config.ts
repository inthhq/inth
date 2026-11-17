import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { join, relative, resolve } from 'pathe';
import { defineBuildConfig } from 'unbuild';

import { writeTranslationEntries } from '../shared/write-translation-entries.mjs';

const dir = fileURLToPath(new URL('.', import.meta.url));
const runtimeSource = resolve(dir, 'src/runtime');
const runtimeOutput = resolve(dir, 'dist/runtime');

/** The built file of a runtime source module, or `undefined` if none. */
const builtRuntimeFile = function builtRuntimeFile(source: string) {
	const path = join(runtimeOutput, relative(runtimeSource, source));
	const base = path.replace(/\.(?:[cm]?ts|[cm]?js)$/u, '');
	return [`${base}.js`, `${base}.mjs`, `${base}/index.js`, path].find(
		(file) => existsSync(file) && !statSync(file).isDirectory()
	);
};

// The Vue entries and the runtime the Nuxt module (@inth/nuxt) loads.
// The runtime is transpiled file by file into dist/runtime/ (unbuild runs
// mkdist before rollup), and the entries import it from there rather than
// bundling a second copy: the layout nuxt-module-build produced while the
// Nuxt module lived here.
export default defineBuildConfig({
	alias: {
		'#imports': resolve(dir, 'src/runtime/vue/stubs.ts'),
	},
	declaration: 'node16',
	entries: [
		{
			addRelativeDeclarationExtensions: true,
			builder: 'mkdist',
			esbuild: { jsx: 'automatic', jsxFactory: 'h', jsxImportSource: 'vue' },
			ext: 'js',
			input: 'src/runtime/',
			outDir: 'dist/runtime',
			pattern: ['**', '!**/*.{spec,test}.{js,cts,mts,ts,jsx,tsx}'],
		},
		'./src/vite',
		'./src/index',
		'./src/testing',
		'./src/devtools',
		'./src/gpp',
		'./src/engine',
		'./src/postcss-tailwind3',
	],
	externals: [
		/dist[\\/]runtime[\\/]/u,
		'#app',
		'#app/nuxt',
		'nuxt',
		'vue',
		'vite',
		'@inth/sdk',
		'reka-ui',
		'defu',
		'ufo',
	],
	hooks: {
		// Before unbuild checks that every export map target exists.
		'rollup:done'() {
			writeTranslationEntries(resolve(dir, 'dist'));
		},
		'rollup:options'(_context, options) {
			options.plugins = [
				{
					name: 'inth-vue:runtime-externals',
					async resolveId(id, importer) {
						if (!/(?:^|[\\/])runtime[\\/]/u.test(id)) {
							return null;
						}
						const resolved = await this.resolve(id, importer, {
							skipSelf: true,
						});
						if (!resolved?.id.startsWith(runtimeSource)) {
							return null;
						}
						const built = builtRuntimeFile(resolved.id);
						return built ? { external: true, id: built } : null;
					},
				},
				...(Array.isArray(options.plugins)
					? options.plugins
					: [options.plugins].filter(Boolean)),
			];
		},
	},
	rollup: {
		cjsBridge: false,
		emitCJS: false,
		esbuild: { target: 'esnext' },
	},
});
