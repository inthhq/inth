import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse, stringify } from 'yaml';

import * as publisher from './publish-mobile';
import { recoverMobileRelease } from './recover-mobile-release';
import { compareTrees } from './sync-vendored-core';
import { createRelease } from './tegami';
import {
	createMobileRelease,
	nativeSourceDigest,
	readNativeVersion,
	writeNativeVersion,
} from './tegami-mobile';
import type { NativeSdkKind } from './tegami-mobile';

const roots: string[] = [];
const swiftSource = 'native/core-swift/Sources/C15tCore';
const swiftVersionPath = `${swiftSource}/Transports.swift`;
const swiftPrivacyPath = `${swiftSource}/Resources/PrivacyInfo.xcprivacy`;
const androidPropertiesPath = 'native/core-android/gradle.properties';
const androidProtocolPath =
	'native/core-android/c15t-core/src/main/kotlin/com/c15t/core/transport/C15tProtocol.kt';
const rnPropertiesPath = 'packages/react-native/android/gradle.properties';
const rnLibraryPath =
	'packages/react-native/android/c15t-react-native/library.gradle';
const rnManifestPath = 'packages/react-native/package.json';
const lockPath = '.tegami/mobile/publish-lock.yaml';

const write = (root: string, path: string, content: string) => {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), content);
};
const read = (root: string, path: string) =>
	readFileSync(join(root, path), 'utf8');

const fixture = () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'c15t-mobile-tegami-')));
	roots.push(root);
	const files: Record<string, string> = {
		'LICENSE.md': 'Apache License 2.0\n',
		NOTICE: 'c15t attribution\n',
		'Package.swift': '// swift-tools-version:5.9\nimport PackageDescription\n',
		'native/core-android/build.gradle.kts': '// Native build\n',
		'native/core-android/gradle/wrapper/gradle-wrapper.properties':
			'distributionUrl=fixture\n',
		'native/core-android/settings.gradle.kts': '// Native modules\n',
		'native/core-swift/Package.swift':
			'// swift-tools-version:5.9\nimport PackageDescription\n',
		'native/core-swift/README.md': '# Native Swift fixture\n',
		'native/core-swift/Tests/C15tCoreTests/consent-tests.swift':
			'// Native tests\n',
		'native/examples/consent-demo/android/build.gradle.kts':
			'// Included demo build\n',
		'native/examples/consent-demo/fixtures/iab-init.json': '{"iab":true}\n',
		'native/protocol/index.json': '{"fixtures":[]}\n',
		'package.json': JSON.stringify({
			name: 'mobile-release-fixture',
			private: true,
			workspaces: ['packages/*'],
		}),
		'packages/logger/package.json': JSON.stringify({
			name: '@c15t/logger',
			version: '8.0.0',
		}),
		[rnManifestPath]: `${JSON.stringify(
			{
				name: '@c15t/react-native',
				private: true,
				version: '9.0.0-alpha.1',
			},
			null,
			2
		)}\n`,
		[swiftVersionPath]:
			'extension C15t { public static let version = "1.2.3" }\n',
		[`${swiftSource}/consent-core.swift`]: 'public struct ConsentCore {}\n',
		[swiftPrivacyPath]: '<plist><dict/></plist>\n',
		'packages/react-native/vendor/C15tCore/Transports.swift':
			'stale generated copy\n',
		'packages/react-native/vendor/C15tCore/retired.swift':
			'// Removed upstream\n',
		[androidPropertiesPath]:
			'c15t.native.version=2.4.0\nother.property=unchanged\n',
		[androidProtocolPath]:
			'object C15tProtocol { const val DEFAULT_SDK_VERSION = "2.4.0" }\n',
		[rnPropertiesPath]: 'c15t.core.version=2.4.0\nother.property=unchanged\n',
		[rnLibraryPath]:
			"String coreVersion = prop('c15t.core.version') ?: '2.4.0'\n",
	};
	for (const module of ['c15t-core', 'c15t-android', 'c15t-consent-ui']) {
		files[`native/core-android/${module}/build.gradle.kts`] =
			'// Module build\n';
		files[`native/core-android/${module}/src/main/module.kt`] =
			'// Module source\n';
	}
	for (const [path, content] of Object.entries(files)) {
		write(root, path, content);
	}
	execFileSync('git', ['init', '--quiet', '-b', 'canary'], { cwd: root });
	execFileSync('git', ['add', '--all'], { cwd: root });
	return root;
};

const change = (
	root: string,
	packages: Record<string, unknown>,
	name = 'native-change',
	directory = '.tegami/mobile'
) => {
	write(
		root,
		`${directory}/${name}.md`,
		`---\n${stringify({ packages })}---\n\n### ${name}\n\nRelease entry for ${name}.\n`
	);
};

const release = (cwd: string, branch = 'canary') =>
	createMobileRelease({ branch, cwd, github: false });

const apply = async (root: string, branch = 'canary') =>
	(await release(root, branch).draft()).apply();

const recoveryGit = (cwd: string, ...args: string[]) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
const recoveryCommit = (root: string) => {
	recoveryGit(root, 'add', '--all');
	recoveryGit(root, 'commit', '--quiet', '-m', 'test: native release inputs');
	return recoveryGit(root, 'rev-parse', 'HEAD');
};
const completeAndroidTag = (root: string) => {
	const origin = mkdtempSync(join(tmpdir(), 'native-completed-origin-'));
	roots.push(origin);
	recoveryGit(origin, 'init', '--quiet', '--bare');
	recoveryGit(root, 'config', 'user.name', 'Native release test');
	recoveryGit(root, 'config', 'user.email', 'release@example.invalid');
	recoveryGit(root, 'config', 'commit.gpgsign', 'false');
	recoveryCommit(root);
	recoveryGit(root, 'remote', 'add', 'origin', origin);
	recoveryGit(
		root,
		'push',
		'--quiet',
		'origin',
		`HEAD:refs/tags/c15t-android@${readNativeVersion(root, 'android')}`
	);
};
const staleRelease = async (
	squash = false,
	testScript = '#!/bin/sh\nexit 0\n'
) => {
	const root = fixture();
	const origin = realpathSync(mkdtempSync(join(tmpdir(), 'native-origin-')));
	roots.push(origin);
	recoveryGit(origin, 'init', '--quiet', '--bare');
	recoveryGit(root, 'init', '--quiet', '-b', 'canary');
	recoveryGit(root, 'config', 'user.name', 'Native release test');
	recoveryGit(root, 'config', 'user.email', 'release@example.invalid');
	recoveryGit(root, 'config', 'commit.gpgsign', 'false');
	recoveryGit(root, 'remote', 'add', 'origin', origin);
	write(root, 'native/core-android/gradlew', testScript);
	change(root, { 'c15t-android': 'patch', 'c15t-swift': 'patch' });
	recoveryCommit(root);
	recoveryGit(root, 'checkout', '--quiet', '-b', 'version-pr');
	await apply(root);
	const sourceCommit = recoveryCommit(root);
	recoveryGit(root, 'checkout', '--quiet', 'canary');
	write(
		root,
		'NOTICE',
		'A shared native fix landed before the version PR merged.\n'
	);
	recoveryCommit(root);
	recoveryGit(
		root,
		'merge',
		'--quiet',
		squash ? '--squash' : '--no-ff',
		'version-pr',
		'-m',
		'Merge stale version PR'
	);
	if (squash) {
		recoveryCommit(root);
	}
	recoveryGit(root, 'push', '--quiet', 'origin', 'canary', 'version-pr');
	return { origin, root, sourceCommit };
};

const stubGithubReleases = () => {
	const releases = new Set<string>();
	vi.stubGlobal(
		'fetch',
		vi.fn((input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? 'GET';
			if (!url.startsWith('https://api.github.com/repos/c15t/c15t/')) {
				throw new Error(`Unexpected test request: ${url}`);
			}
			const tag = url.match(/\/releases\/tags\/(?<tag>.+)$/u)?.groups?.tag;
			if (tag && method === 'HEAD') {
				return Promise.resolve(
					new Response('{}', {
						status: releases.has(decodeURIComponent(tag)) ? 200 : 404,
					})
				);
			}
			if (url.endsWith('/releases') && method === 'POST') {
				const body = JSON.parse(String(init?.body)) as { tag_name: string };
				releases.add(body.tag_name);
				return Promise.resolve(new Response('{}', { status: 201 }));
			}
			if (url.endsWith('/pulls') && method === 'GET') {
				return Promise.resolve(new Response('[]'));
			}
			throw new Error(`Unexpected test request: ${method} ${url}`);
		})
	);
	return releases;
};

beforeEach(() => {
	vi.spyOn(publisher, 'mobileSdkPublished').mockResolvedValue(false);
	vi.spyOn(publisher, 'checkMobilePublishEnvironment').mockImplementation(
		() => {
			throw new Error('A dry run must not require publication credentials.');
		}
	);
	vi.spyOn(publisher, 'prepareMobileSdk').mockImplementation(() => {
		throw new Error('A dry run must not build native artifacts.');
	});
	vi.spyOn(publisher, 'publishMobileSdk').mockImplementation(() => {
		throw new Error('A test must not upload native artifacts.');
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	for (const root of roots.splice(0)) {
		rmSync(root, { force: true, recursive: true });
	}
});

describe('independent native version drafts', () => {
	it('preserves every npm manifest byte when applying a native version', async () => {
		const root = fixture();
		const paths = [
			'package.json',
			'packages/logger/package.json',
			rnManifestPath,
		];
		const original = paths.map((path) => read(root, path));
		change(root, { 'c15t-android': 'patch', 'c15t-swift': 'patch' });
		await apply(root);
		expect(paths.map((path) => read(root, path))).toEqual(original);
	});

	it('bumps Swift request metadata and regenerates the RN copy without changing Android or private npm versions', async () => {
		const root = fixture();
		const privateRn = read(root, rnManifestPath);
		change(root, { 'c15t-swift': 'patch' }, 'swift-fix');
		await apply(root);
		expect(readNativeVersion(root, 'swift')).toBe('1.2.4-canary.0');
		expect(
			compareTrees(
				join(root, swiftSource),
				join(root, 'packages/react-native/vendor/C15tCore')
			)
		).toEqual([]);
		expect(
			read(root, 'packages/react-native/vendor/C15tCore/Transports.swift')
		).toContain('"1.2.4-canary.0"');
		expect(
			existsSync(
				join(root, 'packages/react-native/vendor/C15tCore/retired.swift')
			)
		).toBe(false);
		expect(readNativeVersion(root, 'android')).toBe('2.4.0');
		expect(read(root, rnManifestPath)).toBe(privateRn);
		expect(read(root, 'native/core-swift/CHANGELOG.md')).toContain(
			'Release entry for swift-fix.'
		);
		expect(read(root, lockPath)).toContain(nativeSourceDigest(root, 'swift'));
		expect((await release(root).draft()).hasPending()).toBe(false);
	});

	it('bumps Android source, protocol metadata and both RN artifact pins together', async () => {
		const root = fixture();
		const privateRn = read(root, rnManifestPath);
		const vendored = read(
			root,
			'packages/react-native/vendor/C15tCore/Transports.swift'
		);
		change(root, { 'c15t-android': 'minor' }, 'android-feature');
		await apply(root);
		expect(readNativeVersion(root, 'android')).toBe('2.5.0-canary.0');
		for (const path of [
			androidPropertiesPath,
			androidProtocolPath,
			rnPropertiesPath,
			rnLibraryPath,
		]) {
			expect(read(root, path)).toContain('2.5.0-canary.0');
			expect(read(root, path)).not.toContain('2.4.0');
		}
		expect(readNativeVersion(root, 'swift')).toBe('1.2.3');
		expect(read(root, rnManifestPath)).toBe(privateRn);
		expect(
			read(root, 'packages/react-native/vendor/C15tCore/Transports.swift')
		).toBe(vendored);
		expect(read(root, 'native/core-android/CHANGELOG.md')).toContain(
			'Release entry for android-feature.'
		);
	});

	it('keeps selected native bumps independent of each other and the npm package graph', async () => {
		const root = fixture();
		change(root, { 'c15t-android': 'major', 'c15t-swift': 'patch' });
		const instance = release(root);
		const { graph } = await instance._internal.context();
		expect(
			graph
				.getPackages()
				.map((pkg) => pkg.id)
				.sort()
		).toEqual(['maven:c15t-android', 'swift:c15t-swift']);
		await (await instance.draft()).apply();
		expect(readNativeVersion(root, 'swift')).toBe('1.2.4-canary.0');
		expect(readNativeVersion(root, 'android')).toBe('3.0.0-canary.0');
		expect(read(root, 'packages/logger/package.json')).toContain('8.0.0');
		expect(read(root, rnManifestPath)).toContain('9.0.0-alpha.1');
	});

	it('leaves both stable native versions alone without a release note', async () => {
		const root = fixture();
		expect((await release(root).draft()).hasPending()).toBe(false);
		expect(readNativeVersion(root, 'swift')).toBe('1.2.3');
		expect(readNativeVersion(root, 'android')).toBe('2.4.0');
	});

	it('raises canary bases for larger changes and increments later canaries', async () => {
		const root = fixture();
		const steps = [
			{ android: '2.4.1-canary.0', swift: '1.2.4-canary.0', type: 'patch' },
			{ android: '2.5.0-canary.0', swift: '1.3.0-canary.0', type: 'minor' },
			{ android: '2.5.0-canary.1', swift: '1.3.0-canary.1', type: 'patch' },
			{ android: '3.0.0-canary.0', swift: '2.0.0-canary.0', type: 'major' },
		];
		for (const [index, step] of steps.entries()) {
			change(
				root,
				{ 'c15t-android': step.type, 'c15t-swift': step.type },
				`step-${index}`
			);
			// oxlint-disable-next-line no-await-in-loop -- Each draft consumes the preceding native version.
			await apply(root);
			expect(readNativeVersion(root, 'swift')).toBe(step.swift);
			expect(readNativeVersion(root, 'android')).toBe(step.android);
		}
	});

	it('replays consumed canary notes when both SDKs graduate to stable', async () => {
		const root = fixture();
		change(
			root,
			{ 'c15t-android': 'minor', 'c15t-swift': 'patch' },
			'first-native-release'
		);
		await apply(root);
		expect(read(root, '.tegami/mobile/first-native-release.md')).toContain(
			'exit-prerelease'
		);
		expect((await release(root).draft()).hasPending()).toBe(false);
		const stable = await release(root, 'main').draft();
		expect(stable.hasPending()).toBe(true);
		await stable.apply();
		expect(readNativeVersion(root, 'swift')).toBe('1.2.4');
		expect(readNativeVersion(root, 'android')).toBe('2.5.0');
		for (const kind of ['swift', 'android']) {
			expect(
				read(root, `native/core-${kind}/CHANGELOG.md`).split('-canary.0')[0]
			).toContain('Release entry for first-native-release.');
		}
		expect(
			existsSync(join(root, '.tegami/mobile/first-native-release.md'))
		).toBe(false);
		expect((await release(root, 'main').draft()).hasPending()).toBe(false);
	});

	it.each([androidProtocolPath, rnPropertiesPath, rnLibraryPath])(
		'rejects drift in %s before applying a native draft',
		async (path) => {
			const root = fixture();
			write(root, path, read(root, path).replace('2.4.0', '2.4.1'));
			change(root, { 'c15t-android': 'patch' });
			await expect(release(root).draft()).rejects.toThrow(
				'Native Android version differs'
			);
			expect(read(root, androidPropertiesPath)).toContain(
				'c15t.native.version=2.4.0'
			);
			expect(existsSync(join(root, lockPath))).toBe(false);
		}
	);
});

describe('native publish plans', () => {
	it('finishes missing Android tags from locked sources after Central publishes without uploading again', async () => {
		const { root, sourceCommit, origin } = await staleRelease();
		vi.mocked(publisher.mobileSdkPublished).mockResolvedValue(true);
		await expect(release(root).getPublishStatus()).rejects.toThrow(
			'source/version mismatch'
		);
		await expect(release(root).publish({ dryRun: true })).rejects.toThrow(
			'source/version mismatch'
		);
		const releases = stubGithubReleases();
		vi.stubEnv('CI', 'true');
		vi.stubEnv('GITHUB_TOKEN', 'test-token');
		await recoverMobileRelease({ branch: 'canary', cwd: root, sourceCommit });
		expect(
			recoveryGit(
				origin,
				'rev-parse',
				'refs/tags/c15t-android@2.4.1-canary.0^{commit}'
			)
		).toBe(sourceCommit);
		expect(releases).toEqual(
			new Set(['1.2.4-canary.0', 'c15t-android@2.4.1-canary.0'])
		);
		expect(publisher.checkMobilePublishEnvironment).not.toHaveBeenCalled();
		expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
		expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		'accepts later source edits once a matching Android remote tag exists, annotated %s',
		async (annotated) => {
			const { root, sourceCommit, origin } = await staleRelease();
			recoveryGit(
				origin,
				'-c',
				'user.name=Native release test',
				'-c',
				'user.email=release@example.invalid',
				'-c',
				'tag.gpgsign=false',
				'tag',
				...(annotated ? ['-a', '-m', 'Android release'] : []),
				'c15t-android@2.4.1-canary.0',
				sourceCommit
			);
			vi.mocked(publisher.mobileSdkPublished).mockResolvedValue(true);
			await expect(
				release(root).publish({ dryRun: true })
			).resolves.toBeDefined();
			expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
		}
	);

	it.each([false, true])(
		'rejects a published Android tag with sources different from the lock, annotated %s',
		async (annotated) => {
			const { root, origin } = await staleRelease();
			const tag = 'c15t-android@2.4.1-canary.0';
			const wrongCommit = recoveryGit(root, 'rev-parse', 'HEAD');
			recoveryGit(
				origin,
				'-c',
				'user.name=Native release test',
				'-c',
				'user.email=release@example.invalid',
				'-c',
				'tag.gpgsign=false',
				'tag',
				...(annotated ? ['-a', '-m', 'Wrong Android release'] : []),
				tag,
				wrongCommit
			);
			vi.mocked(publisher.mobileSdkPublished).mockResolvedValue(true);
			await expect(release(root).getPublishStatus()).rejects.toThrow(
				'differs from the recorded native release sources'
			);
			await expect(release(root).publish({ dryRun: true })).rejects.toThrow(
				'differs from the recorded native release sources'
			);
			expect(recoveryGit(origin, 'rev-parse', `${tag}^{commit}`)).toBe(
				wrongCommit
			);
			expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
			expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
			expect(
				recoveryGit(root, 'worktree', 'list', '--porcelain').match(
					/^worktree /gmu
				)
			).toHaveLength(1);
		}
	);

	it('refuses a mismatching local Android tag before completing the remote tag', async () => {
		const { root, sourceCommit, origin } = await staleRelease();
		stubGithubReleases();
		recoveryGit(root, 'tag', 'c15t-android@2.4.1-canary.0');
		vi.mocked(publisher.mobileSdkPublished).mockResolvedValue(true);
		await expect(
			recoverMobileRelease({ branch: 'canary', cwd: root, sourceCommit })
		).rejects.toThrow('Unpushed Android tag');
		expect(
			recoveryGit(origin, 'tag', '--list', 'c15t-android@2.4.1-canary.0')
		).toBe('');
		expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
	});

	it('refuses an uncommitted restoration that hides changed committed Android inputs', async () => {
		const { root, sourceCommit } = await staleRelease();
		write(
			root,
			'NOTICE',
			`${recoveryGit(root, 'show', `${sourceCommit}:NOTICE`)}\n`
		);
		vi.mocked(publisher.mobileSdkPublished).mockResolvedValue(true);
		await expect(release(root).getPublishStatus()).rejects.toThrow(
			'Commit every native release input'
		);
		expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		'completes both GitHub releases after a partial native publish, later Swift edit %s',
		async (edited) => {
			const root = fixture();
			const origin = realpathSync(
				mkdtempSync(join(tmpdir(), 'c15t-native-release-origin-'))
			);
			roots.push(origin);
			const git = (cwd: string, ...args: string[]) =>
				execFileSync('git', args, {
					cwd,
					encoding: 'utf8',
					stdio: 'pipe',
				}).trim();
			git(origin, 'init', '--quiet', '--bare');
			git(root, 'init', '--quiet', '-b', 'canary');
			git(root, 'config', 'user.name', 'Native release test');
			git(root, 'config', 'user.email', 'release@example.invalid');
			git(root, 'config', 'commit.gpgsign', 'false');
			git(root, 'remote', 'add', 'origin', origin);
			const commit = () => {
				git(root, 'add', '--all');
				git(root, 'commit', '--quiet', '-m', 'test: native release inputs');
			};
			change(root, { 'c15t-android': 'patch', 'c15t-swift': 'patch' });
			commit();
			await apply(root);
			commit();

			const releases = stubGithubReleases();
			vi.stubEnv('CI', 'true');
			vi.stubEnv('GITHUB_TOKEN', 'test-token');
			const published = new Set<NativeSdkKind>();
			let androidPending = true;
			vi.mocked(publisher.mobileSdkPublished).mockImplementation((kind) =>
				Promise.resolve(published.has(kind))
			);
			vi.mocked(publisher.checkMobilePublishEnvironment).mockImplementation(
				() => {}
			);
			vi.mocked(publisher.prepareMobileSdk).mockImplementation(() => {});
			vi.mocked(publisher.publishMobileSdk).mockImplementation(({ kind }) => {
				if (kind === 'android' && androidPending) {
					return Promise.reject(new Error('Maven Central is VALIDATING.'));
				}
				published.add(kind);
				return Promise.resolve();
			});
			const withGithub = () =>
				createMobileRelease({ branch: 'canary', cwd: root });
			await expect(withGithub().publish()).rejects.toThrow('VALIDATING');
			expect(published).toEqual(new Set(['swift']));
			expect(releases.size).toBe(0);
			const swiftTag = '1.2.4-canary.0';
			if (edited) {
				write(
					root,
					`${swiftSource}/consent-core.swift`,
					'// Later Swift fix\n'
				);
				commit();
			} else {
				git(origin, 'tag', '--delete', swiftTag);
				git(root, 'tag', '--delete', swiftTag);
			}
			androidPending = false;
			vi.mocked(publisher.publishMobileSdk).mockClear();
			await withGithub().publish();
			expect(releases).toEqual(
				new Set([swiftTag, 'c15t-android@2.4.1-canary.0'])
			);
			expect(git(origin, 'tag', '--list').split('\n')).toEqual([
				swiftTag,
				'c15t-android@2.4.1-canary.0',
			]);
			expect(vi.mocked(publisher.publishMobileSdk).mock.calls).toEqual([
				[{ cwd: root, kind: 'android', version: '2.4.1-canary.0' }],
			]);
			expect((await withGithub().getPublishStatus()).status).toBe('success');
		}
	);

	it.each([false, true])(
		'resumes only pending Android after Swift publishes, later Swift edit %s',
		async (edited) => {
			const root = fixture();
			change(root, { 'c15t-android': 'patch', 'c15t-swift': 'patch' });
			await apply(root);
			vi.mocked(publisher.mobileSdkPublished).mockImplementation((kind) =>
				Promise.resolve(kind === 'swift')
			);
			vi.mocked(publisher.checkMobilePublishEnvironment).mockImplementation(
				() => {}
			);
			vi.mocked(publisher.prepareMobileSdk).mockImplementation(() => {});
			vi.mocked(publisher.publishMobileSdk).mockResolvedValue(undefined);
			if (edited) {
				write(root, `${swiftSource}/consent-core.swift`, '// Next Swift fix\n');
			}
			expect((await release(root).getPublishStatus()).status).toBe('pending');
			await release(root).publish();
			expect(
				vi.mocked(publisher.checkMobilePublishEnvironment).mock.calls
			).toEqual([['android']]);
			const pending = {
				cwd: root,
				kind: 'android',
				version: '2.4.1-canary.0',
			};
			expect(vi.mocked(publisher.prepareMobileSdk).mock.calls).toEqual([
				[pending],
			]);
			expect(vi.mocked(publisher.publishMobileSdk).mock.calls).toEqual([
				[pending],
			]);
		}
	);

	it('binds optional Swift resources to a pending publish lock', async () => {
		const root = fixture();
		const path = 'native/core-swift/Resources/policy.json';
		write(root, path, '{"version":1}\n');
		change(root, { 'c15t-swift': 'patch' });
		await apply(root);
		write(root, path, '{"version":2}\n');
		await expect(release(root).publish({ dryRun: true })).rejects.toThrow(
			'source/version mismatch'
		);
		expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
	});

	it.each([
		'LICENSE.md',
		'NOTICE',
		'native/protocol/index.json',
		'native/core-swift/Tests/C15tCoreTests/consent-tests.swift',
		'native/core-android/c15t-android/build.gradle.kts',
	])(
		'allows the next release draft after a completed lock and later edits to %s',
		async (path) => {
			const root = fixture();
			change(root, { 'c15t-android': 'patch', 'c15t-swift': 'patch' });
			await apply(root);
			const recordedSwiftVersion = readNativeVersion(root, 'swift');
			const recordedDigest = nativeSourceDigest(root, 'swift');
			completeAndroidTag(root);
			vi.mocked(publisher.mobileSdkPublished).mockResolvedValue(true);
			write(root, path, `${read(root, path)}\n// Next release input\n`);
			change(root, { 'c15t-swift': 'patch' }, 'next-release');
			expect((await release(root).getPublishStatus()).status).toBe('success');
			expect(publisher.mobileSdkPublished).toHaveBeenCalledWith(
				'swift',
				recordedSwiftVersion,
				root,
				recordedDigest
			);
			await apply(root);
			expect(readNativeVersion(root, 'swift')).toBe('1.2.4-canary.1');
		}
	);

	it('allows a completed canary lock to graduate through the stable release draft', async () => {
		const root = fixture();
		change(root, { 'c15t-swift': 'patch' });
		await apply(root);
		vi.mocked(publisher.mobileSdkPublished).mockResolvedValue(true);
		expect((await release(root, 'main').getPublishStatus()).status).toBe(
			'success'
		);
		await apply(root, 'main');
		expect(readNativeVersion(root, 'swift')).toBe('1.2.4');
		expect(read(root, lockPath)).toContain('branch: main');
	});

	it('checks the recorded published version after a newer source version is already present', async () => {
		const root = fixture();
		change(root, { 'c15t-swift': 'patch' });
		await apply(root);
		const digest = nativeSourceDigest(root, 'swift');
		writeNativeVersion(root, 'swift', '9.0.0');
		vi.mocked(publisher.mobileSdkPublished).mockResolvedValue(true);
		expect((await release(root).getPublishStatus()).status).toBe('success');
		expect(publisher.mobileSdkPublished).toHaveBeenCalledWith(
			'swift',
			'1.2.4-canary.0',
			root,
			digest
		);
	});

	it.each(['canary', 'main'])(
		'validates a real %s publish dry-run without credentials, builds or uploads',
		async (branch) => {
			const root = fixture();
			change(root, { 'c15t-android': 'minor', 'c15t-swift': 'patch' });
			await apply(root, branch);
			const lock = read(root, lockPath);
			const plan = await release(root, branch).publish({ dryRun: true });
			expect(plan).toMatchObject({ options: { dryRun: true } });
			expect(publisher.mobileSdkPublished).toHaveBeenCalledWith(
				'swift',
				readNativeVersion(root, 'swift'),
				root,
				nativeSourceDigest(root, 'swift')
			);
			expect(publisher.mobileSdkPublished).toHaveBeenCalledWith(
				'android',
				readNativeVersion(root, 'android'),
				root,
				nativeSourceDigest(root, 'android')
			);
			expect(publisher.checkMobilePublishEnvironment).not.toHaveBeenCalled();
			expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
			expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
			expect(read(root, lockPath)).toBe(lock);
		}
	);

	it.each(['branch', 'version', 'missing', 'digest'])(
		'rejects pending native lock %s tampering before uploading',
		async (kind) => {
			const root = fixture();
			change(root, { 'c15t-swift': 'patch' });
			await apply(root);
			let lock = read(root, lockPath);
			if (kind === 'branch') {
				lock = lock.replace('branch: canary', 'branch: main');
			} else if (kind === 'version') {
				lock = lock.replace(
					'version: 1.2.4-canary.0',
					'version: 1.2.4-canary.1'
				);
			} else if (kind === 'digest') {
				lock = lock.replace(/digest: [a-f\d]+/u, `digest: ${'0'.repeat(64)}`);
			} else {
				const data: Record<string, unknown> = parse(lock);
				delete data['c15t:native'];
				lock = stringify(data);
			}
			write(root, lockPath, lock);
			await expect(release(root).publish({ dryRun: true })).rejects.toThrow(
				'Native publish lock'
			);
			expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
			expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
		}
	);

	it('rejects an unfinished canary lock on the stable branch', async () => {
		const root = fixture();
		change(root, { 'c15t-android': 'patch' });
		await apply(root);
		await expect(
			release(root, 'main').publish({ dryRun: true })
		).rejects.toThrow('release branch');
	});

	it.each(['canary', 'main'])(
		'rejects a coherent source and lock version outside the %s release channel',
		async (branch) => {
			const root = fixture();
			change(root, { 'c15t-swift': 'patch' });
			await apply(root, branch);
			const previousVersion = readNativeVersion(root, 'swift');
			const invalidVersion = branch === 'canary' ? '1.2.4' : '1.2.4-canary.0';
			writeNativeVersion(root, 'swift', invalidVersion);
			const lock = read(root, lockPath)
				.replaceAll(previousVersion, invalidVersion)
				.replace(
					/digest: [a-f\d]+/u,
					`digest: ${nativeSourceDigest(root, 'swift')}`
				);
			write(root, lockPath, lock);
			await expect(
				release(root, branch).publish({ dryRun: true })
			).rejects.toThrow('not a valid release');
		}
	);

	it.each<{ kind: NativeSdkKind; path: string }>([
		{ kind: 'swift', path: 'Package.swift' },
		{ kind: 'swift', path: `${swiftSource}/consent-core.swift` },
		{ kind: 'swift', path: swiftPrivacyPath },
		{ kind: 'swift', path: 'native/protocol/index.json' },
		{
			kind: 'android',
			path: 'native/core-android/c15t-android/build.gradle.kts',
		},
		{
			kind: 'android',
			path: 'native/examples/consent-demo/android/build.gradle.kts',
		},
	])(
		'rejects committed $kind source changes in $path after the version lock was written',
		async ({ kind, path }) => {
			const root = fixture();
			change(root, { [`c15t-${kind}`]: 'patch' });
			await apply(root);
			recoveryGit(root, 'init', '--quiet', '-b', 'canary');
			recoveryGit(root, 'config', 'user.name', 'Native release test');
			recoveryGit(root, 'config', 'user.email', 'release@example.invalid');
			recoveryGit(root, 'config', 'commit.gpgsign', 'false');
			recoveryCommit(root);
			write(root, path, `${read(root, path)}\n`);
			recoveryCommit(root);
			await expect(release(root).publish({ dryRun: true })).rejects.toThrow(
				'source/version mismatch'
			);
			expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
			expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
		}
	);
});

describe('exact-source native recovery', () => {
	it.each([
		'native/core-android/buildSrc/build.gradle.kts',
		'native/core-android/settings.gradle',
		'native/core-android/c15t-android/gradle.properties',
		'native/examples/consent-demo/android/buildSrc/build.gradle.kts',
	])(
		'refuses an alternate recovery commit with unbound build code at %s',
		async (path) => {
			const { root, sourceCommit } = await staleRelease();
			recoveryGit(root, 'checkout', '--quiet', '--detach', sourceCommit);
			write(root, path, '// New executable Gradle configuration\n');
			const forged = recoveryCommit(root);
			recoveryGit(
				root,
				'push',
				'--quiet',
				'origin',
				`${forged}:refs/heads/alternate-source`
			);
			recoveryGit(root, 'checkout', '--quiet', 'canary');
			await expect(
				recoverMobileRelease({
					branch: 'canary',
					cwd: root,
					dryRun: true,
					github: false,
					sourceCommit: forged,
				})
			).rejects.toThrow('source/version mismatch');
			expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
			expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
		}
	);

	it('runs historical Android tests without release credentials and preserves them for publication', async () => {
		const testScript = `#!/bin/sh
for name in C15T_CENTRAL_TOKEN C15T_MAVEN_SIGNING_KEY GITHUB_TOKEN GH_TOKEN GIT_CONFIG_VALUE_0 C15T_UNRELATED_RELEASE_SECRET; do
  if printenv "$name" >/dev/null; then exit 42; fi
done
[ "$JAVA_HOME" = /test-only-jdk ] || exit 43
case "$*" in *--no-daemon*) ;; *) exit 44 ;; esac
exit 0
`;
		const { root, sourceCommit } = await staleRelease(false, testScript);
		for (const key of [
			'C15T_CENTRAL_TOKEN',
			'C15T_MAVEN_SIGNING_KEY',
			'GITHUB_TOKEN',
			'GH_TOKEN',
			'GIT_CONFIG_VALUE_0',
			'C15T_UNRELATED_RELEASE_SECRET',
		]) {
			vi.stubEnv(key, 'test-only-release-secret');
		}
		vi.stubEnv('JAVA_HOME', '/test-only-jdk');
		vi.mocked(publisher.checkMobilePublishEnvironment).mockImplementation(
			() => {}
		);
		vi.mocked(publisher.prepareMobileSdk).mockImplementation(() => {});
		vi.mocked(publisher.publishMobileSdk).mockResolvedValue(undefined);
		await expect(
			recoverMobileRelease({
				branch: 'canary',
				cwd: root,
				github: false,
				sourceCommit,
			})
		).resolves.toBeDefined();
		expect(publisher.publishMobileSdk).toHaveBeenCalledTimes(2);
		expect(process.env.C15T_CENTRAL_TOKEN).toBe('test-only-release-secret');
		expect(process.env.GITHUB_TOKEN).toBe('test-only-release-secret');
	});
	it.each([false, true])(
		'recovers a stale version PR after merge, squash %s',
		async (squash) => {
			const { root, sourceCommit, origin } = await staleRelease(squash);
			const head = recoveryGit(root, 'rev-parse', 'HEAD');
			const lock = read(root, lockPath);
			const worktrees = recoveryGit(root, 'worktree', 'list', '--porcelain');
			await expect(release(root).publish({ dryRun: true })).rejects.toThrow(
				'source/version mismatch'
			);
			const plan = await recoverMobileRelease({
				branch: 'canary',
				cwd: root,
				dryRun: true,
				github: false,
				sourceCommit,
			});
			if (plan === 'skipped') {
				throw new Error('The pending native release must be selected.');
			}
			expect(
				plan
					.getPackagesToPublish()
					.map((pkg) => pkg.id)
					.sort()
			).toEqual(['maven:c15t-android', 'swift:c15t-swift']);
			expect(recoveryGit(root, 'rev-parse', 'HEAD')).toBe(head);
			expect(recoveryGit(root, 'branch', '--show-current')).toBe('canary');
			expect(recoveryGit(root, 'status', '--porcelain')).toBe('');
			expect(recoveryGit(root, 'worktree', 'list', '--porcelain')).toBe(
				worktrees
			);
			expect(read(root, lockPath)).toBe(lock);
			expect(recoveryGit(origin, 'tag', '--list')).toBe('');
			expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
			expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
		}
	);

	it.each([
		['invalid-sha', 'full 40-character'],
		['wrong-lock', 'exact current native publish lock'],
		['drift', 'source/version mismatch'],
		['dirty', 'clean release checkout'],
		['wrong-branch', 'release branch'],
	])(
		'refuses %s recovery before builds or uploads',
		async (kind, expectedError) => {
			const { root, sourceCommit } = await staleRelease();
			let candidate = sourceCommit;
			if (kind === 'invalid-sha') {
				candidate = '--all';
			}
			if (kind === 'drift') {
				candidate = recoveryGit(root, 'rev-parse', 'HEAD');
			}
			if (kind === 'wrong-lock') {
				write(root, lockPath, `${read(root, lockPath)}\n# Different lock\n`);
				recoveryCommit(root);
			}
			if (kind === 'dirty') {
				write(root, 'NOTICE', 'uncommitted\n');
			}
			await expect(
				recoverMobileRelease({
					branch: kind === 'wrong-branch' ? 'main' : 'canary',
					cwd: root,
					dryRun: true,
					github: false,
					sourceCommit: candidate,
				})
			).rejects.toThrow(expectedError);
			expect(
				recoveryGit(root, 'worktree', 'list', '--porcelain').match(
					/worktree /gu
				)
			).toHaveLength(1);
			expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
			expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
		}
	);

	it('finishes only pending Android work after Swift published and preserves retry files', async () => {
		const { root, sourceCommit, origin } = await staleRelease();
		const state = mkdtempSync(join(tmpdir(), 'native-recovery-state-'));
		roots.push(state);
		vi.stubEnv('C15T_NATIVE_STATE_DIR', state);
		const journal = `{"version":"2.4.1-canary.0","bundleSha256":"${'a'.repeat(64)}"}\n`;
		writeFileSync(join(state, 'maven-2.4.1-canary.0.json'), journal);
		writeFileSync(join(state, 'maven-2.4.1-canary.0.zip'), 'sealed signed ZIP');
		vi.mocked(publisher.mobileSdkPublished).mockImplementation((kind) =>
			Promise.resolve(kind === 'swift')
		);
		vi.mocked(publisher.checkMobilePublishEnvironment).mockImplementation(
			() => {}
		);
		vi.mocked(publisher.prepareMobileSdk).mockImplementation(() => {});
		vi.mocked(publisher.publishMobileSdk).mockImplementation(
			({ cwd, kind }) => {
				expect(recoveryGit(cwd, 'rev-parse', 'HEAD')).toBe(sourceCommit);
				expect(recoveryGit(cwd, 'remote', 'get-url', 'origin')).toBe(origin);
				expect(kind).toBe('android');
				return Promise.resolve();
			}
		);
		await recoverMobileRelease({
			branch: 'canary',
			cwd: root,
			github: false,
			sourceCommit,
		});
		expect(
			publisher.checkMobilePublishEnvironment
		).toHaveBeenCalledExactlyOnceWith('android');
		expect(publisher.publishMobileSdk).toHaveBeenCalledTimes(1);
		expect(readFileSync(join(state, 'maven-2.4.1-canary.0.json'), 'utf8')).toBe(
			journal
		);
		expect(readFileSync(join(state, 'maven-2.4.1-canary.0.zip'), 'utf8')).toBe(
			'sealed signed ZIP'
		);
	});

	it('refuses an unknown Central upload despite new-upload confirmation without touching its journal or ZIP', async () => {
		const { root, sourceCommit } = await staleRelease();
		const state = mkdtempSync(join(tmpdir(), 'native-recovery-unknown-'));
		roots.push(state);
		vi.stubEnv('C15T_MAVEN_NEW_UPLOAD_VERSION', '2.4.1-canary.0');
		vi.stubEnv('C15T_NATIVE_STATE_DIR', state);
		vi.stubEnv('C15T_NATIVE_PUBLISH', 'true');
		for (const name of [
			'C15T_CENTRAL_USERNAME',
			'C15T_CENTRAL_TOKEN',
			'C15T_MAVEN_SIGNING_KEY',
			'C15T_MAVEN_SIGNING_PASSWORD',
		]) {
			vi.stubEnv(name, 'test-only');
		}
		const journal = JSON.stringify({
			bundleSha256: 'a'.repeat(64),
			version: '2.4.1-canary.0',
		});
		const stateFile = join(state, 'maven-2.4.1-canary.0.json');
		const bundleFile = join(state, 'maven-2.4.1-canary.0.zip');
		writeFileSync(stateFile, journal);
		writeFileSync(bundleFile, 'original signed bundle');
		vi.mocked(publisher.mobileSdkPublished).mockImplementation((kind) =>
			Promise.resolve(kind === 'swift')
		);
		vi.mocked(publisher.checkMobilePublishEnvironment).mockImplementation(
			() => {}
		);
		vi.mocked(publisher.prepareMobileSdk).mockImplementation(() => {});
		vi.mocked(publisher.publishMobileSdk).mockRestore();
		const network = vi.fn(() => {
			throw new Error('Recovery must not upload again.');
		});
		vi.stubGlobal('fetch', network);
		await expect(
			recoverMobileRelease({
				branch: 'canary',
				cwd: root,
				github: false,
				sourceCommit,
			})
		).rejects.toThrow('upload outcome is unknown');
		expect(network).not.toHaveBeenCalled();
		expect(readFileSync(stateFile, 'utf8')).toBe(journal);
		expect(readFileSync(bundleFile, 'utf8')).toBe('original signed bundle');
		expect(
			recoveryGit(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)
		).toHaveLength(1);
	});

	it('fails historical Android tests before preparing or publishing either SDK', async () => {
		const { root, sourceCommit } = await staleRelease(
			false,
			'#!/bin/sh\nexit 1\n'
		);
		vi.mocked(publisher.checkMobilePublishEnvironment).mockImplementation(
			() => {}
		);
		await expect(
			recoverMobileRelease({
				branch: 'canary',
				cwd: root,
				github: false,
				sourceCommit,
			})
		).rejects.toThrow();
		expect(publisher.prepareMobileSdk).not.toHaveBeenCalled();
		expect(publisher.publishMobileSdk).not.toHaveBeenCalled();
		expect(
			recoveryGit(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)
		).toHaveLength(1);
	});
});

it('isolates native notes and locks from existing npm releases and the private RN package', async () => {
	const root = fixture();
	change(root, { 'c15t-swift': 'patch' }, 'native-note');
	change(root, { '@c15t/logger': 'patch' }, 'npm-note', '.tegami');
	write(root, '.tegami/publish-lock.yaml', '# Existing npm publish lock\n');
	const nativeNote = read(root, '.tegami/mobile/native-note.md');
	const npmNote = read(root, '.tegami/npm-note.md');
	const npmLock = read(root, '.tegami/publish-lock.yaml');
	const privateRn = read(root, rnManifestPath);
	const npmRelease = createRelease({
		branch: 'canary',
		cwd: root,
		github: false,
	});
	const npmDraft = await npmRelease.draft();
	expect(npmDraft.getChangelogs().map((entry) => entry.filename)).toEqual([
		'npm-note.md',
	]);
	expect(npmDraft.getPackageDraft('npm:@c15t/logger')?.type).toBe('patch');
	expect(npmDraft.getPackageDraft('npm:@c15t/react-native')).toBeUndefined();
	expect(read(root, '.tegami/mobile/native-note.md')).toBe(nativeNote);
	const nativeDraft = await release(root).draft();
	expect(nativeDraft.getChangelogs().map((entry) => entry.filename)).toEqual([
		'native-note.md',
	]);
	await nativeDraft.apply();
	expect(read(root, '.tegami/npm-note.md')).toBe(npmNote);
	expect(read(root, '.tegami/publish-lock.yaml')).toBe(npmLock);
	expect(read(root, rnManifestPath)).toBe(privateRn);
	expect(read(root, 'packages/logger/package.json')).toContain('8.0.0');
	expect(existsSync(join(root, lockPath))).toBe(true);
});
