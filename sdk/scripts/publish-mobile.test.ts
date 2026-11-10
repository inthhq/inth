import childProcess from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';

import * as swiftExport from './export-swift-package';
import { nativeSourceDigest } from './native-sdk-package';
import * as maven from './publish-maven';
import type { MavenDeployment } from './publish-maven';
import type * as MobileSdk from './publish-mobile';

const realExecFileSync = childProcess.execFileSync;
const realExportSwiftPackage = swiftExport.exportSwiftPackage;
const mocks = {
	createMavenBundle: vi.spyOn(maven, 'createMavenBundle'),
	execFileSync: vi.spyOn(childProcess, 'execFileSync'),
	exportSwiftPackage: vi.spyOn(swiftExport, 'exportSwiftPackage'),
	getMavenDeployment: vi.spyOn(maven, 'getMavenDeployment'),
	publishMavenDeployment: vi.spyOn(maven, 'publishMavenDeployment'),
	stageMavenRelease: vi.spyOn(maven, 'stageMavenRelease'),
	uploadMavenBundle: vi.spyOn(maven, 'uploadMavenBundle'),
};
syncBuiltinESMExports();

const version = '3.1.0-canary.2';
const deploymentId = '28570f16-da32-4c14-bd2e-c1acc0782365';
const environment = {
	C15T_CENTRAL_TOKEN: 'central-fixture-token',
	C15T_CENTRAL_USERNAME: 'central-fixture-user',
	C15T_MAVEN_SIGNING_KEY: 'signing-fixture-key',
	C15T_MAVEN_SIGNING_PASSWORD: 'signing-fixture-password',
	C15T_NATIVE_PUBLISH: 'true',
};
let root: string;
let cwd: string;
let state: string;
let stateFile: string;
let sdk: typeof MobileSdk;

const git = (directory: string, ...args: string[]) =>
	realExecFileSync('git', args, {
		cwd: directory,
		encoding: 'utf8',
		stdio: 'pipe',
	}).trim();
const write = (path: string, content: string) => {
	mkdirSync(dirname(join(cwd, path)), { recursive: true });
	writeFileSync(join(cwd, path), content);
};
const commit = () => {
	git(cwd, 'add', '--all');
	git(
		cwd,
		'-c',
		'user.name=Release fixture',
		'-c',
		'user.email=release@example.invalid',
		'-c',
		'commit.gpgsign=false',
		'commit',
		'--quiet',
		'-m',
		'test: source release'
	);
	return git(cwd, 'rev-parse', 'HEAD');
};
const publishTag = () =>
	git(cwd, 'push', 'origin', `HEAD:refs/tags/${version}`);
const deployment = (deploymentState: MavenDeployment['deploymentState']) => ({
	deploymentId,
	deploymentState,
});
const input = (kind: 'swift' | 'android') => ({ cwd, kind, version });
const existingMavenState = () => {
	mkdirSync(state, { recursive: true });
	writeFileSync(
		stateFile,
		JSON.stringify({
			bundleSha256: 'a'.repeat(64),
			deploymentId,
			version,
		})
	);
};
const expectNoPublicationEffects = () => {
	expect(
		mocks.execFileSync.mock.calls.every(
			([command, args]) =>
				command === 'git' &&
				(args?.[0] === 'diff' ||
					(args?.[0] === 'ls-files' && args.includes('--others')))
		)
	).toBe(true);
	expect(mocks.exportSwiftPackage).not.toHaveBeenCalled();
	expect(mocks.stageMavenRelease).not.toHaveBeenCalled();
	expect(mocks.createMavenBundle).not.toHaveBeenCalled();
	expect(mocks.uploadMavenBundle).not.toHaveBeenCalled();
	expect(mocks.publishMavenDeployment).not.toHaveBeenCalled();
};

beforeEach(async () => {
	vi.resetAllMocks();
	root = realpathSync(mkdtempSync(join(tmpdir(), 'c15t-mobile-publish-')));
	cwd = join(root, 'checkout');
	state = join(root, 'durable-state');
	stateFile = join(state, `maven-${version}.json`);
	mkdirSync(cwd);
	for (const [key, value] of Object.entries(environment)) {
		vi.stubEnv(key, value);
	}
	vi.stubEnv('GNUPGHOME', process.env.GNUPGHOME);
	vi.stubEnv('C15T_NATIVE_STATE_DIR', state);
	vi.stubEnv('C15T_MAVEN_NEW_UPLOAD_VERSION', undefined);
	vi.spyOn(process, 'cwd').mockReturnValue(cwd);
	write('LICENSE.md', 'Apache License 2.0\n');
	write('NOTICE', 'Recorded attribution\n');
	write(
		'Package.swift',
		'// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name: "c15t", targets: [.target(name: "C15tCore", path: "native/core-swift/Sources/C15tCore")])\n'
	);
	write(
		'native/core-swift/Package.swift',
		'// swift-tools-version:5.9\nimport PackageDescription\nlet package = Package(name: "C15tCore", targets: [.target(name: "C15tCore")])\n'
	);
	write('native/core-swift/README.md', '# Swift SDK\n');
	write(
		'native/core-swift/Sources/C15tCore/Transports.swift',
		`extension C15t { public static let version = "${version}" }\n`
	);
	write(
		'native/core-swift/Tests/C15tCoreTests/test.swift',
		'// Recorded test\n'
	);
	write('native/protocol/index.json', '{"fixtures":[]}\n');
	write('native/core-swift/Resources/policy.json', '{"version":1}\n');
	write('native/examples/consent-demo/fixtures/policy.json', '{}\n');
	write(
		'native/examples/consent-demo/android/build.gradle.kts',
		'// Included demo build\n'
	);
	git(cwd, 'init', '--quiet');
	commit();
	const origin = join(root, 'origin.git');
	git(root, 'init', '--bare', '--quiet', origin);
	git(cwd, 'remote', 'add', 'origin', origin);
	mocks.execFileSync.mockImplementation((command, args, options) => {
		const argv = args ?? [];
		if (command === 'gpg' || command === 'swift') {
			return '';
		}
		if (command !== 'git') {
			throw new Error(`Unexpected executable: ${command}`);
		}
		return realExecFileSync(command, argv, options);
	});
	mocks.exportSwiftPackage.mockImplementation(realExportSwiftPackage);
	mocks.createMavenBundle.mockReturnValue(join(state, `maven-${version}.zip`));
	mocks.stageMavenRelease.mockImplementation(() => {});
	mocks.getMavenDeployment.mockRejectedValue(
		new Error('Unexpected status check')
	);
	mocks.publishMavenDeployment.mockRejectedValue(
		new Error('Unexpected publish')
	);
	mocks.uploadMavenBundle.mockRejectedValue(new Error('Unexpected upload'));
	sdk = await import('./publish-mobile');
});

afterEach(() => {
	vi.mocked(process.cwd).mockRestore();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	rmSync(root, { force: true, recursive: true });
});
afterAll(() => {
	vi.restoreAllMocks();
	syncBuiltinESMExports();
});

test.each([true, false])(
	'removes completed retry bundles while preserving unknown uploads, journal %s',
	async (journal) => {
		existingMavenState();
		if (!journal) {
			rmSync(stateFile);
		}
		writeFileSync(join(state, `maven-${version}.zip`), 'completed bundle');
		const pendingVersion = '3.0.0-canary.1';
		const pending = join(state, `maven-${pendingVersion}.json`);
		const unknown = JSON.stringify({
			bundleSha256: 'b'.repeat(64),
			version: pendingVersion,
		});
		writeFileSync(pending, unknown);
		writeFileSync(join(state, `maven-${pendingVersion}.zip`), 'pending bundle');
		git(cwd, 'push', 'origin', `HEAD:refs/tags/c15t-android@${version}`);
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string) =>
				Promise.resolve(
					new Response(null, {
						status: url.includes(`/${version}/`) ? 200 : 404,
					})
				)
			)
		);
		for (const name of Object.keys(environment)) {
			vi.stubEnv(name, undefined);
		}
		await sdk.pruneCompletedMobileReleaseState(cwd);
		expect(readdirSync(state).sort()).toEqual([
			`maven-${pendingVersion}.json`,
			`maven-${pendingVersion}.zip`,
		]);
		expect(readFileSync(pending, 'utf8')).toBe(unknown);
		expect(mocks.getMavenDeployment).not.toHaveBeenCalled();
		expect(
			mocks.execFileSync.mock.calls.every(
				([command, args]) => command === 'git' && args?.[0] === 'ls-remote'
			)
		).toBe(true);
		expect(mocks.stageMavenRelease).not.toHaveBeenCalled();
		expect(mocks.uploadMavenBundle).not.toHaveBeenCalled();
		expect(mocks.publishMavenDeployment).not.toHaveBeenCalled();
	}
);

test.each([
	{ error: undefined, status: 200, tag: false },
	{ error: undefined, status: 404, tag: true },
	{
		error: 'Cannot read Maven Central status: HTTP 503.',
		status: 503,
		tag: true,
	},
])(
	'retains retry state when completion is uncertain, $status tag $tag',
	async ({ error, status, tag }) => {
		existingMavenState();
		const before = readFileSync(stateFile, 'utf8');
		writeFileSync(join(state, `maven-${version}.zip`), 'signed bundle');
		if (tag) {
			git(cwd, 'push', 'origin', `HEAD:refs/tags/c15t-android@${version}`);
		}
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string) =>
				Promise.resolve(
					new Response(null, {
						status: url.includes('/c15t-consent-ui/') ? status : 200,
					})
				)
			)
		);
		const result = await sdk.pruneCompletedMobileReleaseState(cwd).then(
			() => undefined,
			(cause: Error) => cause.message
		);
		expect(result).toBe(error);
		expect(readFileSync(stateFile, 'utf8')).toBe(before);
		expect(readFileSync(join(state, `maven-${version}.zip`), 'utf8')).toBe(
			'signed bundle'
		);
	}
);

test.each([
	'{invalid',
	JSON.stringify({ bundleSha256: 'b'.repeat(64), version: '3.0.0-canary.1' }),
])(
	'refuses to prune an invalid or mislabeled retry journal, %s',
	async (saved) => {
		mkdirSync(state);
		writeFileSync(stateFile, saved);
		writeFileSync(join(state, `maven-${version}.zip`), 'signed bundle');
		const request = vi.fn();
		vi.stubGlobal('fetch', request);
		await expect(sdk.pruneCompletedMobileReleaseState(cwd)).rejects.toThrow();
		expect(readFileSync(stateFile, 'utf8')).toBe(saved);
		expect(readFileSync(join(state, `maven-${version}.zip`), 'utf8')).toBe(
			'signed bundle'
		);
		expect(request).not.toHaveBeenCalled();
	}
);

test.each([
	undefined,
	'Package.swift',
	'native/core-swift/Sources/C15tCore/Transports.swift',
	'native/core-swift/Resources/policy.json',
])(
	'checks the recorded monorepo Swift tag after later edits, tamper %s',
	async (tamper) => {
		const recordedDigest = nativeSourceDigest(cwd, 'swift');
		if (tamper) {
			write(
				tamper,
				`${readFileSync(join(cwd, tamper), 'utf8')}\n// Unexpected published edit\n`
			);
			commit();
		}
		publishTag();
		write('NOTICE', 'Later attribution\n');
		write(
			'native/core-swift/Sources/C15tCore/Transports.swift',
			'extension C15t { public static let version = "9.0.0" }\n'
		);
		write('native/protocol/index.json', '{"fixtures":["next"]}\n');
		commit();
		const result = await sdk
			.mobileSdkPublished('swift', version, cwd, recordedDigest)
			.then(
				(published) => ({ published }),
				(error: Error) => error.message
			);
		expect(result).toEqual(
			tamper
				? `Swift tag ${version} differs from the recorded native release sources. Never replace a published tag.`
				: { published: true }
		);
		expect(
			mocks.execFileSync.mock.calls.some(
				([command, args]) => command === 'git' && args?.includes('push')
			)
		).toBe(false);
	}
);

test.each(['c15t-core', 'c15t-android', 'c15t-consent-ui', undefined])(
	'checks all RN Maven pins before npm publication, missing module %s',
	async (missing) => {
		const library = join(
			cwd,
			'packages/react-native/android/c15t-react-native/library.gradle'
		);
		mkdirSync(dirname(library), { recursive: true });
		writeFileSync(
			library,
			`String coreVersion = prop('c15t.core.version') ?: '${version}'\n`
		);
		const request = vi.fn((url: string) =>
			Promise.resolve(
				new Response('', {
					status: missing && url.includes(`/${missing}/`) ? 404 : 200,
				})
			)
		);
		vi.stubGlobal('fetch', request);
		const error = await sdk.checkReactNativeMavenPublication(cwd).then(
			() => undefined,
			(cause: Error) => cause.message
		);
		expect(error).toBe(
			missing
				? `Publish all three native Android ${version} artifacts to Maven Central before releasing @c15t/react-native to npm.`
				: undefined
		);
		expect(request.mock.calls.map(([url]) => url).sort()).toEqual(
			['c15t-core', 'c15t-android', 'c15t-consent-ui']
				.map(
					(artifact) =>
						`https://repo.maven.apache.org/maven2/com/c15t/${artifact}/${version}/${artifact}-${version}.pom`
				)
				.sort()
		);
	}
);

test.each([
	['swift', 'tracked'],
	['swift', 'untracked'],
	['android', 'tracked'],
	['android', 'untracked'],
] as const)(
	'uncommitted %s %s inputs stop before a native build or upload',
	(kind, stateValue) => {
		write(
			stateValue === 'tracked'
				? 'LICENSE.md'
				: `native/core-${kind}/untracked.source`,
			'Uncommitted release input\n'
		);
		expect(() => sdk.prepareMobileSdk(input(kind))).toThrow(/commit/iu);
		expectNoPublicationEffects();
		expect(existsSync(state)).toBe(false);
	}
);

test.each(['swift', 'android'] as const)(
	'disabled %s publication stops before preparation or upload',
	async (kind) => {
		vi.stubEnv('C15T_NATIVE_PUBLISH', 'false');
		expect(() => sdk.prepareMobileSdk(input(kind))).toThrow(/disabled/u);
		await expect(sdk.publishMobileSdk(input(kind))).rejects.toThrow(
			/disabled/u
		);
		expectNoPublicationEffects();
		expect(existsSync(state)).toBe(false);
	}
);

test.each(['build.gradle.kts', 'untracked.gradle.kts'])(
	'uncommitted included demo input %s stops before preparation',
	(name) => {
		write(
			`native/examples/consent-demo/android/${name}`,
			'// Uncommitted build input\n'
		);
		expect(() => sdk.prepareMobileSdk(input('android'))).toThrow(/commit/iu);
		expectNoPublicationEffects();
		expect(existsSync(state)).toBe(false);
	}
);

test.each([
	['android', 'C15T_NATIVE_STATE_DIR'],
	['android', 'C15T_CENTRAL_USERNAME'],
	['android', 'C15T_CENTRAL_TOKEN'],
	['android', 'C15T_MAVEN_SIGNING_KEY'],
	['android', 'C15T_MAVEN_SIGNING_PASSWORD'],
] as const)(
	'requires %s credential or configuration %s before effects',
	async (kind, name) => {
		vi.stubEnv(name, ' ');
		expect(() => sdk.prepareMobileSdk(input(kind))).toThrow(name);
		await expect(sdk.publishMobileSdk(input(kind))).rejects.toThrow(name);
		expectNoPublicationEffects();
		expect(existsSync(state)).toBe(false);
	}
);

test('resumes a published Maven deployment without rebuilding, signing or uploading', async () => {
	existingMavenState();
	const before = readFileSync(stateFile, 'utf8');
	mocks.getMavenDeployment.mockResolvedValue(deployment('PUBLISHED'));
	sdk.prepareMobileSdk(input('android'));
	await expect(sdk.publishMobileSdk(input('android'))).resolves.toBeUndefined();
	expect(mocks.getMavenDeployment).toHaveBeenCalledWith({ cwd, stateFile });
	expectNoPublicationEffects();
	expect(readFileSync(stateFile, 'utf8')).toBe(before);
});

test('rejects a saved Maven deployment for another version before any provider call', async () => {
	existingMavenState();
	writeFileSync(
		stateFile,
		JSON.stringify({ deploymentId, version: '3.0.0-canary.1' })
	);
	await expect(sdk.publishMobileSdk(input('android'))).rejects.toThrow(
		/different version/u
	);
	expect(mocks.getMavenDeployment).not.toHaveBeenCalled();
	expectNoPublicationEffects();
});

test.each(['VALIDATING', 'PUBLISHING'] as const)(
	'keeps %s Maven deployments pending without another publish request',
	async (stateValue) => {
		existingMavenState();
		mocks.getMavenDeployment.mockResolvedValue(deployment(stateValue));
		sdk.prepareMobileSdk(input('android'));
		await expect(sdk.publishMobileSdk(input('android'))).rejects.toThrow(
			stateValue
		);
		expectNoPublicationEffects();
	}
);

test('publishes a saved validated deployment and requires the final published state', async () => {
	existingMavenState();
	mocks.getMavenDeployment.mockResolvedValue(deployment('VALIDATED'));
	mocks.publishMavenDeployment
		.mockResolvedValueOnce(deployment('PUBLISHING'))
		.mockResolvedValueOnce(deployment('PUBLISHED'));
	await expect(sdk.publishMobileSdk(input('android'))).rejects.toThrow(
		'PUBLISHING'
	);
	await expect(sdk.publishMobileSdk(input('android'))).resolves.toBeUndefined();
	expect(mocks.publishMavenDeployment).toHaveBeenCalledWith({ cwd, stateFile });
	expect(mocks.stageMavenRelease).not.toHaveBeenCalled();
	expect(mocks.uploadMavenBundle).not.toHaveBeenCalled();
});

test('builds an Android distribution in external state and hands that exact ZIP to the uploader', async () => {
	vi.stubEnv('C15T_MAVEN_NEW_UPLOAD_VERSION', version);
	mocks.uploadMavenBundle.mockResolvedValue(deployment('VALIDATING'));
	sdk.prepareMobileSdk(input('android'));
	await expect(sdk.publishMobileSdk(input('android'))).rejects.toThrow(
		'VALIDATING'
	);
	expect(mocks.stageMavenRelease).toHaveBeenCalledWith({ cwd, version });
	expect(mocks.createMavenBundle).toHaveBeenCalledWith({
		output: join(state, `maven-${version}.zip`),
		repository: join(cwd, 'native/core-android/build/maven-staging'),
		version,
	});
	expect(mocks.uploadMavenBundle).toHaveBeenCalledWith({
		bundle: join(state, `maven-${version}.zip`),
		cwd,
		stateFile,
		version,
	});
	expect(mocks.publishMavenDeployment).not.toHaveBeenCalled();
	expect(existsSync(join(cwd, 'gnupg'))).toBe(false);
});

test('rebuilds an unuploaded Maven ZIP left by a failed Swift publication', () => {
	vi.stubEnv('C15T_MAVEN_NEW_UPLOAD_VERSION', version);
	mkdirSync(state, { recursive: true });
	const zip = join(state, `maven-${version}.zip`);
	writeFileSync(zip, 'Previous preparation never reached upload');
	mocks.createMavenBundle.mockImplementation(({ output }) => {
		expect(existsSync(output)).toBe(false);
		writeFileSync(output, 'Freshly staged bundle');
		return output;
	});
	sdk.prepareMobileSdk(input('android'));
	expect(mocks.stageMavenRelease).toHaveBeenCalledOnce();
	expect(readFileSync(zip, 'utf8')).toBe('Freshly staged bundle');
	expect(mocks.uploadMavenBundle).not.toHaveBeenCalled();
});

test.each(['', '3.0.0-canary.1'])(
	'missing Maven journal requires confirmation for the exact version, received %s',
	async (confirmation) => {
		vi.stubEnv('C15T_MAVEN_NEW_UPLOAD_VERSION', confirmation);
		mkdirSync(state, { recursive: true });
		const zip = join(state, `maven-${version}.zip`);
		writeFileSync(zip, 'Preserve the original signed bundle');
		expect(() => sdk.prepareMobileSdk(input('android'))).toThrow(
			/missing.*journal/iu
		);
		await expect(sdk.publishMobileSdk(input('android'))).rejects.toThrow(
			/missing.*journal/iu
		);
		expectNoPublicationEffects();
		expect(readFileSync(zip, 'utf8')).toBe(
			'Preserve the original signed bundle'
		);
	}
);

test('a prepared bundle cannot upload after its new-upload confirmation is removed', async () => {
	vi.stubEnv('C15T_MAVEN_NEW_UPLOAD_VERSION', version);
	sdk.prepareMobileSdk(input('android'));
	vi.stubEnv('C15T_MAVEN_NEW_UPLOAD_VERSION', '');
	await expect(sdk.publishMobileSdk(input('android'))).rejects.toThrow(
		/missing.*journal/iu
	);
	expect(mocks.uploadMavenBundle).not.toHaveBeenCalled();
});

test.each(['nested', 'dot-prefixed', 'symlink'] as const)(
	'rejects %s state paths that resolve inside the checkout before native effects',
	(pathKind) => {
		const inside = join(
			cwd,
			pathKind === 'dot-prefixed' ? '..release' : 'release-state'
		);
		let configured = inside;
		if (pathKind === 'symlink') {
			configured = join(root, 'state-link');
			symlinkSync(cwd, configured, 'dir');
		}
		vi.stubEnv('C15T_NATIVE_STATE_DIR', configured);
		expect(() => sdk.prepareMobileSdk(input('android'))).toThrow(/outside/u);
		expectNoPublicationEffects();
		expect(existsSync(inside)).toBe(false);
	}
);

test('tags the tested monorepo commit using existing Git authentication', async () => {
	vi.stubEnv('C15T_NATIVE_STATE_DIR', undefined);
	vi.stubEnv('C15T_SWIFT_REPOSITORY', undefined);
	vi.stubEnv('C15T_SWIFT_TOKEN', undefined);
	const testedCommit = git(cwd, 'rev-parse', 'HEAD');
	sdk.prepareMobileSdk(input('swift'));
	await sdk.publishMobileSdk(input('swift'));
	expect(
		git(cwd, 'ls-remote', '--tags', 'origin', `refs/tags/${version}`)
	).toBe(`${testedCommit}\trefs/tags/${version}`);
	expect(mocks.exportSwiftPackage).toHaveBeenCalledWith(
		expect.objectContaining({
			cwd,
			manifest: 'root',
			ref: 'HEAD',
		})
	);
	expect(
		mocks.execFileSync.mock.calls.some(([command]) => command === 'gh')
	).toBe(false);
	expect(existsSync(state)).toBe(false);
});

test('accepts an existing matching monorepo tag without another push', async () => {
	publishTag();
	sdk.prepareMobileSdk(input('swift'));
	await sdk.publishMobileSdk(input('swift'));
	expect(
		mocks.execFileSync.mock.calls.some(
			([command, args]) => command === 'git' && args?.includes('push')
		)
	).toBe(false);
});

test('resolves annotated Swift version tags to their source commit', async () => {
	git(
		cwd,
		'-c',
		'user.name=Release fixture',
		'-c',
		'user.email=release@example.invalid',
		'-c',
		'tag.gpgsign=false',
		'tag',
		'-a',
		version,
		'-m',
		'Swift release'
	);
	git(cwd, 'push', 'origin', `refs/tags/${version}`);
	await expect(
		sdk.mobileSdkPublished(
			'swift',
			version,
			cwd,
			nativeSourceDigest(cwd, 'swift')
		)
	).resolves.toBe(true);
});

test.each(['source', 'commit'])(
	'rejects %s changes between Swift preparation and tag publication',
	async (change) => {
		sdk.prepareMobileSdk(input('swift'));
		if (change === 'source') {
			write('Package.swift', '// Unexpected manifest\n');
		} else {
			write('unrelated.txt', 'New commit after preparation\n');
			commit();
		}
		await expect(sdk.publishMobileSdk(input('swift'))).rejects.toThrow(
			'changed after preparation'
		);
		expect(git(cwd, 'ls-remote', '--tags', 'origin')).toBe('');
	}
);

test('does not replace a conflicting remote Swift tag', async () => {
	write('NOTICE', 'Different published attribution\n');
	commit();
	publishTag();
	write('NOTICE', 'Recorded attribution\n');
	commit();
	sdk.prepareMobileSdk(input('swift'));
	await expect(sdk.publishMobileSdk(input('swift'))).rejects.toThrow(
		'Never replace'
	);
	expect(
		mocks.execFileSync.mock.calls.some(
			([command, args]) => command === 'git' && args?.includes('push')
		)
	).toBe(false);
});

test('rejects a monorepo tag whose embedded Swift version differs', async () => {
	publishTag();
	await expect(sdk.mobileSdkPublished('swift', '9.0.0', cwd)).resolves.toBe(
		false
	);
	git(cwd, 'push', 'origin', 'HEAD:refs/tags/9.0.0');
	await expect(sdk.mobileSdkPublished('swift', '9.0.0', cwd)).rejects.toThrow(
		'differs from the recorded'
	);
});
