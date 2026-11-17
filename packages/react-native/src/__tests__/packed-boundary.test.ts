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
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import {
	isForbiddenModule,
	isWebEngineModule,
	isWebOnlyFile,
	moduleReferences,
} from './helpers/module-boundary';

/**
 * What a shipped file may name of the web packages: nothing, except that a
 * `.web` file, which only a web bundle reads, runs on `@c15t/core`.
 */
const forbiddenIn = function forbiddenIn(
	file: string,
	specifiers: readonly string[]
): string[] {
	return specifiers
		.filter(isForbiddenModule)
		.filter(
			(specifier) => !(isWebOnlyFile(file) && isWebEngineModule(specifier))
		);
};

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

test('module boundary sees static require.resolve calls', () => {
	expect(
		moduleReferences(`
			const core = require.resolve('@c15t/core');
			const codec = require['resolve']('@iabtechlabtcf/core');
			const other = loader.resolve('@c15t/backend');
			const cached = require.cache('@c15t/iab');
			const dynamic = require[resolve]('c15t');
		`)
	).toEqual(['@c15t/core', '@iabtechlabtcf/core']);
});

test('packed runtime, declarations and consumer stay independent of web consent packages', () => {
	if (
		!existsSync(join(packageDir, 'dist/index.js')) ||
		!existsSync(join(packageDir, 'dist-types/index.d.ts'))
	) {
		throw new Error(
			'Build @inth/react-native and its dependencies before running the packed-boundary test: bun turbo run build --filter=@inth/react-native'
		);
	}
	const directory = mkdtempSync(join(tmpdir(), 'inth-packed-boundary-'));
	try {
		// This consumer lives outside the workspace. Keep its registry resolution
		// subject to the repository's release-age policy too.
		writeFileSync(
			join(directory, 'bunfig.toml'),
			'[install]\nminimumReleaseAge = 259200\n'
		);
		// Build first, as in the package CI lane. Pack the allowlist, never the checkout.
		const archive = join(directory, 'mobile.tgz');
		execFileSync(
			'pnpm',
			['pack', '--config.ignore-scripts=true', '--out', archive],
			{ cwd: packageDir, stdio: 'pipe' }
		);
		const development = JSON.parse(
			readFileSync(join(packageDir, 'package.json'), 'utf8')
		);
		writeFileSync(
			join(directory, 'package.json'),
			JSON.stringify({
				dependencies: {
					'@inth/react-native': `file:${archive}`,
					'@types/react': '19.2.17',
					// The config plugin runs against the app's own expo/config-plugins.
					expo: development.devDependencies.expo,
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
		const installed = join(directory, 'node_modules/@inth/react-native');
		const manifest = JSON.parse(
			readFileSync(join(installed, 'package.json'), 'utf8')
		);
		const shipped = files(installed);
		expect(
			shipped.some((file) => file.endsWith('vendor/InthApple/InthApple.swift'))
		).toBe(true);
		expect(
			shipped.some((file) =>
				file.endsWith('vendor/InthApple/analytics-integrations.swift')
			)
		).toBe(true);
		expect(
			shipped.some((file) =>
				file.endsWith('vendor/InthConsentUI/consent-views.swift')
			)
		).toBe(true);
		expect(
			shipped.some((file) => /(?:__tests__|\.test\.|\.spec\.)/u.test(file))
		).toBe(false);
		const artifacts = shipped.filter((file) =>
			/\.(?:[cm]?[jt]s|[jt]sx)$/u.test(file)
		);
		expect(artifacts.length).toBeGreaterThan(50);
		for (const file of artifacts) {
			expect(
				forbiddenIn(file, moduleReferences(readFileSync(file, 'utf8'))),
				file
			).toEqual([]);
		}
		// The web twins ship, and an import of a platform-split module stays
		// extensionless, which is the only form a bundler resolves per platform.
		const twins = artifacts
			.filter((file) => file.endsWith('.web.js'))
			.map((file) => file.slice(0, -'.web.js'.length))
			.filter((base) => existsSync(`${base}.js`));
		expect(twins.map((base) => posix.relative(installed, base)).sort()).toEqual(
			['dist/native/client', 'dist/native/presenter']
		);
		const pinned = artifacts
			.filter((path) => path.endsWith('.js'))
			.flatMap((file) =>
				moduleReferences(readFileSync(file, 'utf8'))
					.filter(
						(specifier) =>
							specifier.startsWith('.') &&
							specifier.endsWith('.js') &&
							twins.includes(resolve(dirname(file), specifier.slice(0, -3))) &&
							// A twin names its own native sibling exactly, or it would
							// resolve to itself on web.
							`${resolve(dirname(file), specifier.slice(0, -3))}.web.js` !==
								file
					)
					.map((specifier) => `${file} -> ${specifier}`)
			);
		expect(pinned).toEqual([]);
		// Traverse the built Metro entry. Node resolution selects the same relative files;
		// external native modules are leaves, not Node-executed substitutes for Metro.
		const visited = new Set<string>();
		const runtime = function runtime(path: string): void {
			if (visited.has(path)) {
				return;
			}
			visited.add(path);
			expect(path).not.toContain('expo-plugin');
			// Node resolves `./client` to `client.js`, as Metro does for
			// iOS and Android, so a native bundle never reads a `.web` file.
			expect(isWebOnlyFile(path), path).toBe(false);
			for (const specifier of moduleReferences(readFileSync(path, 'utf8'))) {
				expect(specifier).not.toMatch(/^(?:expo(?:$|[-/])|@expo\/|node:)/u);
				expect(specifier).not.toMatch(
					/^(?:posthog-react-native|@react-native-firebase(?:\/|$)|firebase(?:\/|$))/u
				);
				if (specifier.startsWith('.')) {
					runtime(createRequire(path).resolve(specifier));
				}
			}
		};
		expect(manifest['react-native']).toBe(
			manifest.exports['.']['react-native']
		);
		runtime(resolve(installed, manifest['react-native']));
		runtime(
			resolve(installed, manifest.exports['./integrations']['react-native'])
		);
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
		execFileSync(
			'node',
			[
				'--input-type=module',
				'-e',
				`
				import assert from 'node:assert/strict';
				import { createRequire } from 'node:module';
				import * as imported from '@inth/react-native/expo-plugin';
				const required = createRequire(import.meta.url)('@inth/react-native/expo-plugin');
				for (const plugin of [imported, required]) {
					assert.equal(typeof plugin.default, 'function');
					const config = plugin.applyParamsOnConfig(
						{ name: 'Packed consumer', slug: 'packed-consumer' },
						{ backendURL: 'https://your-project.inth.app', policy: { rules: [{ id: 'everywhere', match: { fallback: true, isDefault: true }, model: 'opt-in', prompt: 'choice' }] } },
						{ argv: ['node', 'expo', 'config'], env: {}, projectRoot: process.cwd() }
					);
					assert.equal(config.extra.inth.backendURL, 'https://your-project.inth.app');
					assert.equal(config.extra.inth.dryRun, false);
					assert.equal('mode' in config.extra.inth, false);
				}
				`,
			],
			{ cwd: directory, stdio: 'pipe' }
		);
		writeFileSync(
			join(directory, 'consumer.ts'),
			`
			import { ConsentProvider, useConsent, type ConsentSnapshot } from '@inth/react-native';
			import withInth, { type InthPluginProps } from '@inth/react-native/expo-plugin';
			import { connectAmplitude, connectFirebaseAnalytics, connectMixpanel, connectPostHog, connectSentryReplay } from '@inth/react-native/integrations';
			export const provider: typeof ConsentProvider = ConsentProvider;
			export const gate: typeof useConsent = useConsent;
			export type Snapshot = ConsentSnapshot;
			export const plugin: typeof withInth = withInth;
			export const pluginProps: InthPluginProps = { backendURL: 'https://your-project.inth.app', policy: { rules: [{ id: 'everywhere', match: { fallback: true, isDefault: true }, model: 'opt-in', prompt: 'choice' }] } };
			export const firebase: typeof connectFirebaseAnalytics = connectFirebaseAnalytics;
			export const posthog: typeof connectPostHog = connectPostHog;
			export const amplitude: typeof connectAmplitude = connectAmplitude;
			export const mixpanel: typeof connectMixpanel = connectMixpanel;
			export const sentryReplay: typeof connectSentryReplay = connectSentryReplay;
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
				resolve(packageDir, 'node_modules/.bin/tsc'),
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

const topics = [
	'quickstart',
	'expo',
	'bare',
	'usage',
	'native-behaviour',
	'configuration',
	'offline',
	'iab',
	'identity',
	'customize',
	'headless',
	'platform-support',
	'apple',
	'android',
	'verify',
	'troubleshooting',
];

test('the actual local mobile tarball contains useful generated docs and no web consent runtime imports', () => {
	if (!existsSync(join(packageDir, 'dist/index.js'))) {
		throw new Error(
			'Build @inth/react-native before checking the packed docs.'
		);
	}
	execFileSync('bun', ['run', 'build:docs'], {
		cwd: packageDir,
		stdio: 'pipe',
	});
	const directory = mkdtempSync(join(tmpdir(), 'inth-mobile-docs-'));
	try {
		const archive = join(directory, 'mobile.tgz');
		execFileSync(
			'pnpm',
			['pack', '--config.ignore-scripts=true', '--out', archive],
			{ cwd: packageDir, stdio: 'pipe' }
		);
		const archiveFiles = execFileSync('tar', ['-tzf', archive], {
			encoding: 'utf8',
		})
			.trim()
			.split('\n');
		for (const path of [
			'AGENTS.md',
			'SKILL.md',
			'docs/README.md',
			'docs/integrations/overview.md',
			'docs/integrations/firebase-analytics.md',
			'docs/integrations/posthog.md',
			'docs/integrations/amplitude.md',
			'docs/integrations/mixpanel-analytics.md',
			'docs/integrations/sentry.md',
			...topics.map((topic) => `docs/frameworks/react-native/${topic}.md`),
		]) {
			expect(archiveFiles).toContain(`package/${path}`);
		}
		const read = (path: string) =>
			execFileSync('tar', ['-xOzf', archive, `package/${path}`], {
				encoding: 'utf8',
			});
		expect(read('package.json')).toContain('"private": true');
		expect(read('README.md')).toContain('private prerelease');
		expect(read('README.md')).not.toContain('Latest NPM Version');
		const localImages = [
			...read('README.md').matchAll(/(?:src|srcset)="(?<target>[^"]+)"/gu),
		]
			.map((image) => image.groups?.target)
			.filter(
				(target): target is string =>
					target !== undefined && !/^(?:https?:|data:)/u.test(target)
			);
		for (const target of localImages) {
			expect(archiveFiles).toContain(posix.normalize(`package/${target}`));
		}
		const manifest: unknown = JSON.parse(read('package.json'));
		if (typeof manifest !== 'object' || manifest === null) {
			throw new Error('The packed manifest must be an object.');
		}
		const dependencyGroups = [
			'dependencies' in manifest ? manifest.dependencies : undefined,
			'optionalDependencies' in manifest
				? manifest.optionalDependencies
				: undefined,
			'peerDependencies' in manifest ? manifest.peerDependencies : undefined,
		];
		for (const [index, dependencies] of dependencyGroups.entries()) {
			if (dependencies === undefined) {
				continue;
			}
			if (typeof dependencies !== 'object' || dependencies === null) {
				throw new Error('Packed dependency groups must be objects.');
			}
			// Only web needs the browser engine, so it is an optional peer and
			// nothing a native app installs.
			expect(Object.keys(dependencies).filter(isForbiddenModule)).toEqual(
				index === 2 ? ['@c15t/core'] : []
			);
		}
		expect(read('package.json')).toMatch(
			/"peerDependenciesMeta":\s*\{\s*"@c15t\/core":\s*\{\s*"optional":\s*true/u
		);
		expect(read('package.json')).not.toContain('workspace:');
		expect(read('docs/frameworks/react-native/quickstart.md')).toContain(
			'ConsentProvider'
		);
		expect(read('docs/frameworks/react-native/expo.md')).toContain(
			'androidMavenRepository'
		);
		expect(read('docs/frameworks/react-native/usage.md')).toContain(
			'CommitResult'
		);
		expect(read('docs/frameworks/react-native/offline.md')).toContain(
			'--expires-at'
		);
		expect(read('SKILL.md')).not.toContain('choices in the browser');
		expect(read('AGENTS.md')).toContain('private prerelease');
		expect(read('AGENTS.md')).not.toContain('Choose your setup');
		for (const topic of topics) {
			expect(read(`docs/frameworks/react-native/${topic}.md`)).not.toContain(
				'<include'
			);
		}
		const runtimeFiles = archiveFiles.filter((file) =>
			/^package\/(?:dist|dist-types)\/.*\.(?:[cm]?js|d\.ts)$/u.test(file)
		);
		expect(runtimeFiles.length).toBeGreaterThan(0);
		for (const path of runtimeFiles) {
			expect(
				forbiddenIn(
					path,
					moduleReferences(read(path.slice('package/'.length)))
				),
				path
			).toEqual([]);
		}
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
}, 60_000);
