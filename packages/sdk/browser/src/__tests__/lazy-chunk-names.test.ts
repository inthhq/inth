// @vitest-environment node
/// <reference types="node" />
/**
 * The ES module build loads the prompt's containers, its in-place options,
 * the dialog and the opt-in confirmation as chunks of their own, each named
 * after its module, and an app's bundler names them after those files
 * again. Content blockers drop files named like a consent banner, which
 * would leave the prompt unable to load, so none of them may have such a
 * name.
 *
 * Reads the built `dist/`, which `turbo run test` builds first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Every file the ES module build imports with `import()`. */
const lazyFiles = function lazyFiles(): string[] {
	const files = new Set<string>();
	for (const file of readdirSync(DIST)) {
		if (!file.endsWith('.js')) {
			continue;
		}
		const code = readFileSync(join(DIST, file), 'utf8');
		for (const match of code.matchAll(
			/import\(\s*["'](?<specifier>\.\/[^"']+)["']\s*\)/gu
		)) {
			files.add(basename(match.groups?.specifier ?? ''));
		}
	}
	return [...files].sort();
};

describe('lazy chunk names', () => {
	it('names no chunk the ES module build loads on demand like a consent banner', () => {
		const files = lazyFiles();
		expect(files).toEqual(
			expect.arrayContaining(['0~card.js', '0~dialog.js', '0~drawer.js'])
		);
		expect(
			files.filter((file) => /banner|consent|cookie|privacy|gdpr/iu.test(file))
		).toEqual([]);
	});
});
