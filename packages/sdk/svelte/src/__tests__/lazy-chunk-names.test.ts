// @vitest-environment node
/**
 * The modules the package loads on demand have neutral names.
 *
 * Vite names a lazy chunk after the module it imports, so the prompt's
 * in-place options, the dialog, the trigger and the confirmations each
 * reach the page as a file named after their source file. The stylesheets
 * the prompt and dialog load on demand are `@inth/sdk/ui`'s, which checks
 * its own. Content blockers
 * drop files named like a consent banner, which would leave the prompt
 * unable to load.
 *
 * Reads the built `dist/`, which `turbo run test` builds first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vite-plus/test';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../dist');

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
				/\.(?:js|svelte)$/u.test(entry.name) &&
				!entry.name.endsWith('.d.ts')
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
		const imports = lazyImports();
		const files = imports.map(({ specifier }) => basename(specifier));
		expect(files).toEqual(
			expect.arrayContaining(['dialog.svelte', 'panel.svelte'])
		);
		expect(
			imports.filter(({ specifier }) =>
				/banner|consent|cookie|privacy|gdpr/iu.test(basename(specifier))
			)
		).toEqual([]);
	});
});
