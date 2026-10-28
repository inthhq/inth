// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import { isForbiddenModule, moduleReferences } from './helpers/module-boundary';

const objectOutput = function objectOutput(error: unknown): string {
	return typeof error === 'object' && error !== null && 'stdout' in error
		? String(error.stdout)
		: String(error);
};

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const files = function files(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		return entry.isDirectory() ? files(path) : [path];
	});
};

test('module boundary sees lazy, CommonJS, type and subpath imports', () => {
	const imports = moduleReferences(`
		import type { A } from 'c15t/react';
		export type { B } from '@c15t/core';
		const lazy = import('@c15t/backend');
		const codec = require('@iabtechlabtcf/core');
		type C = import('@c15t/schema').C;
		import D = require('@c15t/iab');
	`);
	expect(imports).toHaveLength(6);
	expect(imports.every(isForbiddenModule)).toBe(true);
	expect(isForbiddenModule('react-native')).toBe(false);
});

test('packed runtime, declarations and consumer stay independent of web consent packages', () => {
	const directory = mkdtempSync(join(tmpdir(), 'c15t-packed-boundary-'));
	try {
		// Build first, as in the package CI lane. Pack the allowlist, never the checkout.
		const archive = join(directory, 'mobile.tgz');
		execFileSync(
			'bun',
			['pm', 'pack', '--ignore-scripts', '--filename', archive],
			{ cwd: packageDir, stdio: 'pipe' }
		);
		const development = JSON.parse(
			readFileSync(join(packageDir, 'package.json'), 'utf8')
		);
		writeFileSync(
			join(directory, 'package.json'),
			JSON.stringify({
				dependencies: {
					'@c15t/react-native': `file:${archive}`,
					'@types/react': '19.2.17',
					react: development.devDependencies.react,
					'react-native': development.devDependencies['react-native'],
				},
				private: true,
				type: 'module',
			})
		);
		execFileSync('bun', ['install', '--ignore-scripts'], {
			cwd: directory,
			stdio: 'pipe',
		});
		const installed = join(directory, 'node_modules/@c15t/react-native');
		const manifest = JSON.parse(
			readFileSync(join(installed, 'package.json'), 'utf8')
		);
		const shipped = files(installed);
		expect(
			shipped.some((file) => /(?:__tests__|\.test\.|\.spec\.)/u.test(file))
		).toBe(false);
		const artifacts = shipped.filter(
			(file) =>
				file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.d.ts')
		);
		expect(artifacts.length).toBeGreaterThan(50);
		for (const file of artifacts) {
			expect(
				moduleReferences(readFileSync(file, 'utf8')).filter(isForbiddenModule),
				file
			).toEqual([]);
		}
		// Traverse the built Metro entry. Node resolution selects the same relative files;
		// external native modules are leaves, not Node-executed substitutes for Metro.
		const visited = new Set<string>();
		const runtime = function runtime(path: string): void {
			if (visited.has(path)) {
				return;
			}
			visited.add(path);
			expect(path).not.toContain('expo-plugin');
			for (const specifier of moduleReferences(readFileSync(path, 'utf8'))) {
				expect(specifier).not.toMatch(/expo|^node:/u);
				if (specifier.startsWith('.')) {
					runtime(createRequire(path).resolve(specifier));
				}
			}
		};
		expect(manifest['react-native']).toBe(
			manifest.exports['.']['react-native']
		);
		runtime(resolve(installed, manifest['react-native']));
		expect(visited.size).toBeGreaterThan(20);
		// Resolve the actual installed transitive production graph, including optional deps.
		const dependencies = new Set<string>();
		const dependency = function dependency(path: string): void {
			const canonical = realpathSync(path);
			if (dependencies.has(canonical)) {
				return;
			}
			dependencies.add(canonical);
			const pkg = JSON.parse(readFileSync(canonical, 'utf8'));
			for (const name of Object.keys({
				...pkg.dependencies,
				...pkg.optionalDependencies,
			})) {
				expect(isForbiddenModule(name), `${pkg.name} -> ${name}`).toBe(false);
				const resolver = createRequire(canonical);
				const target = resolver.resolve
					.paths(name)
					?.map((root) => join(root, name, 'package.json'))
					.find(existsSync);
				if (!target && pkg.optionalDependencies?.[name]) {
					continue;
				}
				if (!target) {
					throw new Error(
						`Cannot inspect installed dependency ${pkg.name} -> ${name}`
					);
				}
				dependency(target);
			}
		};
		dependency(join(installed, 'package.json'));
		writeFileSync(
			join(directory, 'consumer.ts'),
			`
			import { C15tProvider, useIsAllowed, type ConsentSnapshot } from '@c15t/react-native';
			export const provider: typeof C15tProvider = C15tProvider;
			export const gate: typeof useIsAllowed = useIsAllowed;
			export type Snapshot = ConsentSnapshot;
		`
		);
		// RN 0.87's generated declarations have upstream strict errors. Import
		// resolution remains checked above; match RN's normal skipLibCheck setup.
		writeFileSync(
			join(directory, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					jsx: 'react-jsx',
					lib: ['ES2022'],
					module: 'ESNext',
					moduleResolution: 'bundler',
					noEmit: true,
					skipLibCheck: true,
					strict: true,
					target: 'ES2022',
					types: ['react'],
				},
				files: ['consumer.ts'],
			})
		);
		try {
			execFileSync(
				resolve(packageDir, '../../node_modules/.bin/tsc'),
				['-p', directory],
				{ cwd: directory, stdio: 'pipe' }
			);
		} catch (error) {
			throw new Error(
				`Packed consumer type-check failed: ${objectOutput(error)}`,
				{ cause: error }
			);
		}
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
}, 120_000);
