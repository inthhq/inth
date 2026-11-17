import { posix } from 'node:path';

import { pluginReact } from '@rsbuild/plugin-react';
import { defineConfig } from '@rslib/core';
import type { RsbuildPlugin } from '@rslib/core';

import { compactModuleMinify } from '../sdk/shared/rslib-modules';
import {
	getRsdoctorPlugins,
	standardExcludePatterns,
	standardSourceEntries,
} from '../sdk/shared/rslib-utils';

/** A relative module specifier with the `.js` extension, quoted. */
const RELATIVE_JS_SPECIFIER =
	/(?<quote>["'])(?<path>\.{1,2}\/[^"'\n]*?)\.js\k<quote>/gu;

/**
 * Keep imports of platform-split modules extensionless.
 *
 * A module with a `.web.ts` twin, such as `native/client`, is chosen by the
 * bundler's platform extensions: Metro tries `client.web.js` on web and
 * `client.js` on iOS and Android. It only tries them for a specifier without
 * an extension; `./client.js` names one file on every platform.
 * Bundleless output adds `.js` to every relative import, so this takes it off
 * again for exactly those modules. A twin's own import of its native sibling
 * keeps the extension, since without it the web bundle would resolve the twin
 * to itself. Every other import is left as it was, so a native bundle reads
 * the same files it read before.
 */
const pluginPlatformSplitImports = (): RsbuildPlugin => ({
	name: 'c15t:platform-split-imports',
	setup(api) {
		api.processAssets({ stage: 'optimize-transfer' }, ({ assets, sources }) => {
			const names = Object.keys(assets);
			const split = new Set(
				names
					.filter((name) => name.endsWith('.web.js'))
					.map((name) => name.slice(0, -'.web.js'.length))
					.filter((base) => names.includes(`${base}.js`))
			);
			if (split.size === 0) {
				return;
			}
			for (const name of names) {
				if (!name.endsWith('.js')) {
					continue;
				}
				const own = name.endsWith('.web.js')
					? name.slice(0, -'.web.js'.length)
					: null;
				const code = assets[name]?.source().toString() ?? '';
				const next = code.replaceAll(
					RELATIVE_JS_SPECIFIER,
					(whole, quote: string, path: string) => {
						const target = posix.join(posix.dirname(name), path);
						return split.has(target) && target !== own
							? `${quote}${path}${quote}`
							: whole;
					}
				);
				if (next !== code) {
					assets[name] = new sources.RawSource(next);
				}
			}
		});
	},
});

export default defineConfig({
	lib: [
		{
			bundle: false,
			dts: {
				distPath: './dist-types',
			},
			format: 'esm',
			source: {
				entry: {
					'**': standardSourceEntries,
				},
				exclude: standardExcludePatterns,
			},
		},
		{
			// Expo resolves a config plugin through Node's CommonJS resolver and
			// then `require()`s the file it finds. The unbundled ESM tree above only
			// survives that on a Node new enough to `require()` an ES module, and
			// even there the sibling `import`s are the fatal part, so this entry is
			// bundled into one self-contained CommonJS file. `autoExtension` gives it
			// `.cjs` because the package declares `type: module`, which is the path
			// the `require` export condition points at.
			bundle: true,
			dts: false,
			format: 'cjs',
			id: 'expo-plugin-cjs',
			output: {
				target: 'node',
			},
			source: {
				entry: {
					'expo-plugin/index': './src/expo-plugin/index.ts',
				},
			},
		},
	],
	output: {
		cleanDistPath: true,
		minify: compactModuleMinify,
		target: 'web',
	},
	plugins: [pluginReact(), pluginPlatformSplitImports()],
	tools: {
		rspack: {
			plugins: [...getRsdoctorPlugins()],
		},
	},
});
