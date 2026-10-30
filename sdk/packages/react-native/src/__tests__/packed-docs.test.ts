// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import { isForbiddenModule, moduleReferences } from './helpers/module-boundary';

const mobile = fileURLToPath(new URL('../..', import.meta.url));
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
	if (!existsSync(join(mobile, 'dist/index.js'))) {
		throw new Error(
			'Build @c15t/react-native before checking the packed docs.'
		);
	}
	execFileSync('bun', ['run', 'build:docs'], { cwd: mobile, stdio: 'pipe' });
	const directory = mkdtempSync(join(tmpdir(), 'c15t-mobile-docs-'));
	try {
		const archive = join(directory, 'mobile.tgz');
		execFileSync(
			'bun',
			['pm', 'pack', '--ignore-scripts', '--filename', archive],
			{ cwd: mobile, stdio: 'pipe' }
		);
		const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
			.trim()
			.split('\n');
		for (const path of [
			'AGENTS.md',
			'SKILL.md',
			'docs/README.md',
			...topics.map((topic) => `docs/frameworks/react-native/${topic}.md`),
		]) {
			expect(files).toContain(`package/${path}`);
		}
		const read = (path: string) =>
			execFileSync('tar', ['-xOzf', archive, `package/${path}`], {
				encoding: 'utf8',
			});
		expect(read('package.json')).toContain('"private": true');
		expect(read('README.md')).toContain('private: true');
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
			expect(files).toContain(posix.normalize(`package/${target}`));
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
		for (const dependencies of dependencyGroups) {
			if (dependencies === undefined) {
				continue;
			}
			if (typeof dependencies !== 'object' || dependencies === null) {
				throw new Error('Packed dependency groups must be objects.');
			}
			expect(Object.keys(dependencies).filter(isForbiddenModule)).toEqual([]);
		}
		expect(read('docs/frameworks/react-native/quickstart.md')).toContain(
			'C15tProvider'
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
		const runtimeFiles = files.filter((file) =>
			/^package\/(?:dist|dist-types)\/.*\.(?:[cm]?js|d\.ts)$/u.test(file)
		);
		expect(runtimeFiles.length).toBeGreaterThan(0);
		for (const path of runtimeFiles) {
			expect(
				moduleReferences(read(path.slice('package/'.length))).filter(
					isForbiddenModule
				),
				path
			).toEqual([]);
		}
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
}, 60_000);
