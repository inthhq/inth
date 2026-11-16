import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { WorkspacePackage } from 'tegami';

import type { NativeSdkKind } from './tegami-mobile';

/** One versioned native distribution, independent of the npm package version. */
export class NativeSdk extends WorkspacePackage {
	readonly manager: string;
	readonly name: string;
	readonly path: string;
	readonly kind: NativeSdkKind;
	version: string;
	constructor(cwd: string, kind: NativeSdkKind, version: string) {
		super();
		this.kind = kind;
		this.manager = kind === 'swift' ? 'swift' : 'maven';
		this.name = `c15t-${kind}`;
		this.path = join(cwd, `native/core-${kind}`);
		this.version = version;
	}
}

const nativeInputs = function nativeInputs(kind: NativeSdkKind) {
	const shared = ['LICENSE.md', 'NOTICE', 'native/protocol'];
	if (kind === 'swift') {
		return [
			...shared,
			'Package.swift',
			'native/core-swift/Package.swift',
			'native/core-swift/README.md',
			// Exported with the package for agents in consumer apps.
			'native/core-swift/AGENTS.md',
			'native/core-swift/Sources',
			'native/core-swift/Tests',
			'native/examples/consent-demo/fixtures',
		];
	}
	return [
		...shared,
		'native/core-android/gradle',
		'native/core-android/gradle.properties',
		'native/core-android/build.gradle.kts',
		'native/core-android/settings.gradle.kts',
		'native/examples/consent-demo/android/build.gradle.kts',
		...['c15t-core', 'c15t-android', 'c15t-consent-ui'].flatMap((module) => [
			`native/core-android/${module}/src`,
			`native/core-android/${module}/build.gradle.kts`,
		]),
	];
};

/** Bind a publish lock to the actual native sources, build inputs and fixtures. */
export const nativeSourceDigest = function nativeSourceDigest(
	cwd: string,
	kind: NativeSdkKind
) {
	const hash = createHash('sha256');
	const visited = new Set<string>();
	const visit = (path: string) => {
		if (visited.has(path)) {
			return;
		}
		visited.add(path);
		const absolute = join(cwd, path);
		if (!existsSync(absolute)) {
			throw new Error(`Native release input is missing: ${path}.`);
		}
		const stat = lstatSync(absolute);
		if (stat.isSymbolicLink()) {
			throw new Error(`Native release input is a symlink: ${path}.`);
		}
		if (stat.isDirectory()) {
			for (const name of readdirSync(absolute).sort()) {
				visit(`${path}/${name}`);
			}
		} else if (stat.isFile()) {
			hash
				.update(path)
				.update('\0')
				.update(readFileSync(absolute))
				.update('\0');
		} else {
			throw new Error(`Native release input is not a regular file: ${path}.`);
		}
	};
	const optionalInputs =
		kind === 'swift'
			? ['native/core-swift/Resources']
			: [
					'native/core-android/gradlew',
					'native/core-android/gradlew.bat',
					'native/core-android/c15t-android/consumer-rules.pro',
					'native/core-android/c15t-consent-ui/consumer-rules.pro',
				];
	// Gradle automatically executes buildSrc and can apply other tracked scripts.
	// Include new source files before a version PR stages them, but not ignored outputs.
	// Tegami writes its non-build CHANGELOG.md concurrently with the lock.
	const androidInputs =
		kind === 'android'
			? execFileSync(
					'git',
					[
						'ls-files',
						'--cached',
						'--others',
						'--exclude-standard',
						'-z',
						'--',
						'native/core-android',
						'native/examples/consent-demo/android',
					],
					{ cwd, encoding: 'utf8' }
				)
					.split('\0')
					.filter((path) => path && path !== 'native/core-android/CHANGELOG.md')
			: [];
	for (const path of [
		...nativeInputs(kind),
		...optionalInputs.filter((candidate) => existsSync(join(cwd, candidate))),
		...androidInputs,
	].sort()) {
		visit(path);
	}
	return hash.digest('hex');
};
