// @vitest-environment node
/**
 * The modules the package loads on demand have neutral names.
 *
 * Vite names a lazy chunk after the module it imports, so the prompt's
 * containers, its in-place options, the dialog and the confirmations each
 * reach the page as a file named after their source file. Content blockers
 * drop files named like a consent banner, which would leave the prompt
 * unable to load.
 *
 * Reads the built `dist/`, which `turbo run test` builds first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../dist');

/**
 * Modules only Nuxt's server plugin loads. They never reach the browser,
 * and Nuxt names its chunks by hash.
 */
const SERVER_ONLY = new Set([
	'runtime/plugin.nuxt.js ./resolve-nuxt-consent',
	'runtime/plugin.nuxt.js ./server/banner-preload-priority.model',
]);

/** Every relative `import()` in the built package, by importer. */
const lazyImports = function lazyImports(): {
	importer: string;
	specifier: string;
}[] {
	const found: { importer: string; specifier: string }[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path);
			} else if (
				/\.(?:m?js|vue)$/u.test(entry.name) &&
				!entry.name.endsWith('.d.mts')
			) {
				const code = readFileSync(path, 'utf8');
				for (const match of code.matchAll(
					/import\(\s*["'](?<specifier>\.{1,2}\/[^"']+)["']\s*\)/gu
				)) {
					found.push({
						importer: relative(DIST, path),
						specifier: (match.groups?.specifier ?? '').replace(
							/\.(?:m?js|ts)$/u,
							''
						),
					});
				}
			}
		}
	};
	walk(DIST);
	return found;
};

describe('lazy chunk names', () => {
	test('names no module the package loads on demand like a consent banner', () => {
		const imports = lazyImports().filter(
			({ importer, specifier }) => !SERVER_ONLY.has(`${importer} ${specifier}`)
		);
		const files = imports.map(({ specifier }) => basename(specifier));
		expect(files).toEqual(
			expect.arrayContaining(['card', 'drawer', 'strip', 'dialog.vue'])
		);
		expect(
			imports.filter(({ specifier }) =>
				/banner|consent|cookie|privacy|gdpr/iu.test(basename(specifier))
			)
		).toEqual([]);
	});
});
