import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vite-plus/test';

import {
	consumerGlobalStyles,
	consumerPackageJson,
	consumerScenarios,
	interleaveArms,
	packedTarballName,
	parseConsumerArm,
	workspaceDependencyClosure,
} from './production-consumer';
import type { WorkspacePackageInfo } from './production-consumer';

describe('parseConsumerArm', () => {
	it.each([
		['head=workspace', { kind: 'workspace' }],
		['base=root:/src/inth', { kind: 'root', path: '/src/inth' }],
		['a=tarballs:/tmp/a', { dir: '/tmp/a', kind: 'tarballs' }],
		['alpha2=npm:3.0.0-alpha.2', { kind: 'npm', version: '3.0.0-alpha.2' }],
	])('parses %s', (spec, source) => {
		expect(parseConsumerArm(spec).source).toEqual(source);
	});

	it.each(['workspace', 'Head=workspace', 'a=root:', 'a=git:main'])(
		'rejects %s',
		(spec) => {
			expect(() => parseConsumerArm(spec)).toThrow('Invalid');
		}
	);
});

describe('workspaceDependencyClosure', () => {
	const packages = new Map<string, WorkspacePackageInfo>(
		[
			{
				dependencies: { '@inth/react': 'workspace:*', react: '^19' },
				dir: 'inth',
				name: 'inth',
				version: '3.0.0',
			},
			{
				dependencies: { '@inth/sdk-core': 'workspace:*' },
				dir: 'react',
				name: '@inth/react',
				peerDependencies: { react: '^19' },
				version: '3.0.0',
			},
			{ dir: 'core', name: '@inth/sdk-core', version: '3.0.0' },
			{ dir: 'cli', name: '@c15t/cli', version: '3.0.0' },
		].map((info) => [info.name, info])
	);

	it('follows workspace specifiers only', () => {
		expect(
			workspaceDependencyClosure(packages, 'inth').map((info) => info.name)
		).toEqual(['inth', '@inth/react', '@inth/sdk-core']);
	});

	it('throws for an unknown root', () => {
		expect(() => workspaceDependencyClosure(packages, 'nope')).toThrow(
			'not found'
		);
	});
});

describe('packedTarballName', () => {
	it('matches pack output for scoped and unscoped names', () => {
		expect(packedTarballName('@inth/sdk-core', '3.0.0-alpha.2')).toBe(
			'inth-sdk-core-3.0.0-alpha.2.tgz'
		);
		expect(packedTarballName('inth', '3.0.0-alpha.2')).toBe(
			'inth-3.0.0-alpha.2.tgz'
		);
	});
});

describe('consumerPackageJson', () => {
	const versions = {
		nextVersion: '16.2.10',
		reactVersion: '19.2.7',
		typesNodeVersion: '22.19.11',
		typesReactDomVersion: '19.2.3',
		typesReactVersion: '19.2.17',
		typescriptVersion: '6.0.3',
	};

	it('installs inth from its tarball and overrides every scoped package', () => {
		const manifest = consumerPackageJson({
			...versions,
			tarballs: new Map([
				['inth', '/t/inth.tgz'],
				['@inth/sdk-core', '/t/core.tgz'],
			]),
		});
		expect(manifest.dependencies).toMatchObject({
			inth: 'file:/t/inth.tgz',
			next: '16.2.10',
		});
		expect(manifest.overrides).toEqual({
			'@inth/sdk-core': 'file:/t/core.tgz',
		});
	});

	it('installs a published version without overrides', () => {
		const manifest = consumerPackageJson({
			...versions,
			inthVersion: '3.0.0-alpha.2',
		});
		expect(manifest.dependencies).toMatchObject({ inth: '3.0.0-alpha.2' });
		expect(manifest.overrides).toEqual({});
	});

	it('requires the umbrella tarball', () => {
		expect(() =>
			consumerPackageJson({
				...versions,
				tarballs: new Map([['@inth/sdk-core', '/t/core.tgz']]),
			})
		).toThrow('no inth package');
	});
});

describe('consumerGlobalStyles', () => {
	const template = readFileSync(
		new URL(
			'../../nextjs-browser-bench/production-consumer/template/app/globals.css',
			import.meta.url
		),
		'utf8'
	);
	const imports = (css: string) =>
		css.match(/@import\s[^;]*(?:inth|@inth\/)[^;]*;/gu) ?? [];

	it('loads inth only through the components when they deliver styles', () => {
		expect(imports(consumerGlobalStyles(template, 'automatic'))).toEqual([]);
	});

	it('imports the aggregate stylesheet once for an older build', () => {
		expect(imports(consumerGlobalStyles(template, 'external'))).toEqual([
			"@import '@inth/react/styles.css';",
		]);
	});
});

describe('consumerScenarios', () => {
	it('gives every cold state its own scenario', () => {
		const states = consumerScenarios.map((scenario) => [
			scenario.name,
			scenario.coldState.browserCache,
			scenario.coldState.sdkManifestCache,
			scenario.coldState.frameworkProcess,
			scenario.coldState.cdnEdge,
		]);
		expect(states).toEqual([
			['fresh', 'cold', 'warm', 'warm', 'not-measured'],
			['fresh-warm-browser-cache', 'warm', 'warm', 'warm', 'not-measured'],
			['fresh-cold-sdk-manifest', 'cold', 'cold', 'warm', 'not-measured'],
			['fresh-cold-process', 'cold', 'cold', 'cold', 'not-measured'],
			['saved-consent-accept', 'cold', 'warm', 'warm', 'not-measured'],
			['saved-consent-reject', 'cold', 'warm', 'warm', 'not-measured'],
		]);
	});
});

describe('interleaveArms', () => {
	it('alternates arm order between iterations', () => {
		expect(interleaveArms(['a', 'b'], 0)).toEqual(['a', 'b']);
		expect(interleaveArms(['a', 'b'], 1)).toEqual(['b', 'a']);
	});
});
