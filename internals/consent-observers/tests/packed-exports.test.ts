/**
 * Guards the premise of every other test here: the fixture reaches the SDK only
 * through the packed tarballs and the `exports` they publish, and never
 * discovers a kernel through a global.
 */
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vite-plus/test';

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = join(fixtureDir, 'node_modules');
const self = fileURLToPath(import.meta.url);

const sourceFiles = function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return sourceFiles(path);
		}
		return /\.tsx?$/u.test(entry.name) && path !== self ? [path] : [];
	});
};

const files = [
	...sourceFiles(join(fixtureDir, 'src')),
	...sourceFiles(join(fixtureDir, 'tests')),
];

const IMPORT_PATTERN =
	/(?:from\s+|import\s*\(\s*)['"](?<specifier>@inth\/[^/'"]+(?:\/[^'"]*)?)['"]/gu;

const specifiers = [
	...new Set(
		files.flatMap((file) =>
			[...readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)].map(
				(match) => match.groups?.specifier ?? ''
			)
		)
	),
].toSorted();

const splitSpecifier = function splitSpecifier(specifier: string) {
	const parts = specifier.split('/');
	const packageName = specifier.startsWith('@')
		? parts.slice(0, 2).join('/')
		: (parts[0] ?? '');
	const subpath = specifier.slice(packageName.length);
	return { packageName, subpath: `.${subpath}` };
};

describe('packed public exports', () => {
	test('the fixture imports @inth packages', () => {
		expect(specifiers).toContain('@inth/sdk/runtime');
		expect(specifiers).toContain('@inth/react/context');
		expect(specifiers).toContain('@inth/nextjs/server');
		expect(specifiers).toContain('@inth/tanstack-start/server');
	});

	test.each(specifiers)('%s is a published export', (specifier) => {
		const { packageName, subpath } = splitSpecifier(specifier);
		const manifest = JSON.parse(
			readFileSync(join(modulesDir, packageName, 'package.json'), 'utf8')
		) as { exports?: Record<string, unknown> };
		expect(Object.keys(manifest.exports ?? {})).toContain(subpath);
	});

	test.each(specifiers)(
		'%s resolves inside the extracted tarball',
		(specifier) => {
			const { packageName } = splitSpecifier(specifier);
			const installed = join(modulesDir, packageName);
			// A workspace link would be a symlink into packages/.
			expect(lstatSync(installed).isSymbolicLink()).toBe(false);

			const resolved = realpathSync(
				fileURLToPath(import.meta.resolve(specifier))
			);
			expect(relative(realpathSync(installed), resolved).startsWith('..')).toBe(
				false
			);
		}
	);

	test('no fixture code discovers a kernel through a global', () => {
		const offenders = files.filter((file) =>
			/inthKernel|window\.inth\b|globalThis\.inth\b/u.test(
				readFileSync(file, 'utf8')
			)
		);
		expect(offenders).toEqual([]);
	});
});
