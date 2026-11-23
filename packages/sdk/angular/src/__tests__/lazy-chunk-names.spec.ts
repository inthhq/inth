/**
 * The files the package loads on demand have neutral names.
 *
 * A bundler that names chunks after their modules, as Vite does for an
 * Analog app, names each lazy chunk after the file it imports. ng-packagr
 * names a flat bundle's chunks `<entry file>-<module>-<hash>.mjs`, so both
 * the module and the entry point's flat file name end up in the chunk's
 * name. Content blockers drop files named like a consent banner, which
 * would leave the prompt or the dialog unable to load. The two entry points
 * whose code loads on demand set a neutral `flatModuleFile` for this
 * reason; their import paths stay `@inth/angular/consent-dialog` and
 * `@inth/angular/consent-dialog-trigger`.
 *
 * Reads the built `dist/`, which `turbo run test` builds first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { describe, expect, test } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const FESM = resolve(ROOT, 'dist/fesm2022');

/** Words content blockers match in a file name. */
const BLOCKED = /banner|consent|cookie|privacy|gdpr/iu;

const exportsMap = (
	JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
		exports: Record<string, string | { default?: string }>;
	}
).exports;

/** The file an `@inth/angular` specifier loads. */
const entryFile = function entryFile(specifier: string): string | undefined {
	const target = exportsMap[`.${specifier.slice('@inth/angular'.length)}`];
	const file = typeof target === 'string' ? target : target?.default;
	return file ? basename(file) : undefined;
};

/** Every file the package's flat bundles import with `import()`. */
const lazyFiles = function lazyFiles(): string[] {
	const files = new Set<string>();
	for (const file of readdirSync(FESM)) {
		if (!file.endsWith('.mjs')) {
			continue;
		}
		const code = readFileSync(resolve(FESM, file), 'utf8');
		for (const match of code.matchAll(
			/import\(\s*["'](?<specifier>[^"']+)["']\s*\)/gu
		)) {
			const specifier = match.groups?.specifier ?? '';
			if (specifier.startsWith('./')) {
				files.add(basename(specifier));
			} else if (
				specifier === '@inth/angular' ||
				specifier.startsWith('@inth/angular/')
			) {
				const loaded = entryFile(specifier);
				expect(loaded, specifier).toBeDefined();
				files.add(loaded ?? specifier);
			}
		}
	}
	return [...files].sort();
};

describe('lazy chunk names', () => {
	test('no file the package loads on demand has a name content blockers match', () => {
		const files = lazyFiles();
		// The containers, the prompt surface, the dialog body and the
		// trigger the dialog defers all load on demand.
		expect(files.length).toBeGreaterThanOrEqual(8);
		expect(files).toContain('inth-angular-dialog-trigger.mjs');
		expect(files.filter((file) => BLOCKED.test(file))).toEqual([]);
	});
});
