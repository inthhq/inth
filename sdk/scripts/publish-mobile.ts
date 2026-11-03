import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	readFileSync,
	rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { valid } from 'semver';

import { exportSwiftPackage } from './export-swift-package';
import { nativeSourceDigest } from './native-sdk-package';
import {
	createMavenBundle,
	getMavenDeployment,
	publishMavenDeployment,
	readMavenDeploymentRecord,
	stageMavenRelease,
	uploadMavenBundle,
} from './publish-maven';
import type { NativeSdkKind } from './tegami-mobile';

const required = function required(name: string) {
	const value = process.env[name];
	if (!value?.trim()) {
		throw new Error(`Set ${name} in the mobile release environment.`);
	}
	return value;
};

const outside = function outside(cwd: string, path: string) {
	const result = resolve(path);
	let ancestor = result;
	while (!existsSync(ancestor)) {
		ancestor = dirname(ancestor);
	}
	const actual = resolve(realpathSync(ancestor), relative(ancestor, result));
	const rel = relative(realpathSync(cwd), actual);
	if (
		!rel ||
		(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
	) {
		throw new Error('Keep mobile release state outside the checkout.');
	}
	return actual;
};

const stateDirectory = function stateDirectory(cwd: string) {
	const path = outside(cwd, required('C15T_NATIVE_STATE_DIR'));
	mkdirSync(path, { mode: 0o700, recursive: true });
	return path;
};

/** Refuse uploads until the operator enables native publication and provisions its accounts. */
export const checkMobilePublishEnvironment =
	function checkMobilePublishEnvironment(kind: NativeSdkKind) {
		if (process.env.C15T_NATIVE_PUBLISH !== 'true') {
			throw new Error(
				'Native publication is disabled. Complete mobile acceptance and set C15T_NATIVE_PUBLISH=true in the protected release environment.'
			);
		}
		if (kind === 'android') {
			required('C15T_NATIVE_STATE_DIR');
			for (const name of [
				'C15T_CENTRAL_USERNAME',
				'C15T_CENTRAL_TOKEN',
				'C15T_MAVEN_SIGNING_KEY',
				'C15T_MAVEN_SIGNING_PASSWORD',
			]) {
				required(name);
			}
		}
	};

const preparedSwift = new Map<string, { commit: string; digest: string }>();
const preparedMaven = new Map<string, string>();

const mavenState = (cwd: string, version: string) =>
	join(stateDirectory(cwd), `maven-${version}.json`);

const requireNewMavenUpload = function requireNewMavenUpload(version: string) {
	if (process.env.C15T_MAVEN_NEW_UPLOAD_VERSION !== version) {
		throw new Error(
			`Missing Maven upload journal for ${version}. Restore the original state, or check Central Portal and confirm this exact version with new_maven_upload_version in a fresh workflow dispatch.`
		);
	}
};

/** Omit publication and Git credentials from the environment passed to native tests. */
export const nativeTestEnvironment = function nativeTestEnvironment() {
	const environment: NodeJS.ProcessEnv = {};
	for (const key of [
		'ANDROID_HOME',
		'ANDROID_SDK_ROOT',
		'CI',
		'DEVELOPER_DIR',
		'GRADLE_USER_HOME',
		'HOME',
		'JAVA_HOME',
		'LANG',
		'LC_ALL',
		'PATH',
		'SDKROOT',
		'TEMP',
		'TMP',
		'TMPDIR',
		'TOOLCHAINS',
	]) {
		const value = process.env[key];
		if (value !== undefined) {
			environment[key] = value;
		}
	}
	return environment;
};

/** Refuse native publication or tag completion from uncommitted release inputs. */
export const checkMobileReleaseInputs = function checkMobileReleaseInputs(
	cwd: string,
	kind: NativeSdkKind
) {
	const inputs = [
		...(kind === 'swift' ? ['Package.swift'] : []),
		'LICENSE.md',
		'NOTICE',
		`native/core-${kind}`,
		...(kind === 'android' ? ['native/examples/consent-demo/android'] : []),
		'native/protocol',
		'native/examples/consent-demo/fixtures',
		'.tegami/mobile',
	];
	if (
		execFileSync('git', ['diff', '--name-only', 'HEAD', '--', ...inputs], {
			cwd,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim() ||
		execFileSync(
			'git',
			['ls-files', '--others', '--exclude-standard', '--', ...inputs],
			{ cwd, encoding: 'utf8' }
		).trim()
	) {
		throw new Error('Commit every native release input before publication.');
	}
};

/** Build and check the exact distribution before either native package uploads. */
export const prepareMobileSdk = function prepareMobileSdk({
	cwd,
	kind,
	version,
}: {
	cwd: string;
	kind: NativeSdkKind;
	version: string;
}) {
	checkMobilePublishEnvironment(kind);
	checkMobileReleaseInputs(cwd, kind);
	if (kind === 'swift') {
		const root = mkdtempSync(join(tmpdir(), 'c15t-swift-release-'));
		try {
			const source = exportSwiftPackage({
				cwd,
				manifest: 'root',
				output: join(root, 'package'),
				ref: 'HEAD',
			});
			if (source.version !== version) {
				throw new Error(
					'Commit the Swift version PR before tagging its release.'
				);
			}
			execFileSync(
				'swift',
				['test', '--package-path', source.output, '--jobs', '2'],
				{
					cwd,
					env: nativeTestEnvironment(),
					stdio: 'inherit',
				}
			);
			preparedSwift.set(version, {
				commit: source.sourceCommit,
				digest: nativeSourceDigest(source.output, 'swift'),
			});
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
		return;
	}
	if (existsSync(mavenState(cwd, version))) {
		return;
	}
	requireNewMavenUpload(version);
	const state = stateDirectory(cwd);
	const gpgHome = mkdtempSync(join(tmpdir(), 'c15t-maven-key-'));
	process.once('exit', () => rmSync(gpgHome, { force: true, recursive: true }));
	process.env.GNUPGHOME = gpgHome;
	execFileSync('gpg', ['--batch', '--import'], {
		input: required('C15T_MAVEN_SIGNING_KEY'),
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	stageMavenRelease({ cwd, version });
	const bundlePath = join(state, `maven-${version}.zip`);
	// Rebuild only after the operator confirms a new upload is safe.
	rmSync(bundlePath, { force: true });
	const bundle = createMavenBundle({
		output: bundlePath,
		repository: join(cwd, 'native/core-android/build/maven-staging'),
		version,
	});
	preparedMaven.set(version, bundle);
};

const swiftGit =
	(cwd: string) =>
	(...args: string[]) =>
		execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();

/** Read registry status without changing tags, deployments or package visibility. */
export const mobileSdkPublished = async function mobileSdkPublished(
	kind: NativeSdkKind,
	version: string,
	cwd = process.cwd(),
	recordedDigest?: string
) {
	if (kind === 'swift') {
		const git = swiftGit(cwd);
		if (!git('ls-remote', '--tags', 'origin', `refs/tags/${version}`)) {
			return false;
		}
		git('fetch', '--quiet', '--no-tags', 'origin', `refs/tags/${version}`);
		const commit = git('rev-parse', 'FETCH_HEAD^{commit}');
		const root = mkdtempSync(join(tmpdir(), 'c15t-swift-status-'));
		try {
			const source = exportSwiftPackage({
				cwd,
				manifest: 'root',
				output: join(root, 'package'),
				ref: commit,
			});
			if (
				source.version !== version ||
				nativeSourceDigest(source.output, 'swift') !==
					(recordedDigest ?? nativeSourceDigest(cwd, 'swift'))
			) {
				throw new Error(
					`Swift tag ${version} differs from the recorded native release sources. Never replace a published tag.`
				);
			}
			return true;
		} finally {
			rmSync(root, { force: true, recursive: true });
		}
	}
	const responses = await Promise.all(
		['c15t-core', 'c15t-android', 'c15t-consent-ui'].map((artifact) =>
			fetch(
				`https://repo.maven.apache.org/maven2/com/c15t/${artifact}/${version}/${artifact}-${version}.pom`,
				{ method: 'HEAD' }
			)
		)
	);
	for (const response of responses) {
		if (response.status !== 404 && !response.ok) {
			throw new Error(
				`Cannot read Maven Central status: HTTP ${response.status}.`
			);
		}
	}
	return responses.every((response) => response.ok);
};

/** Remove retry files only after Maven artifacts and the remote Android tag exist. */
export const pruneCompletedMobileReleaseState =
	async function pruneCompletedMobileReleaseState(cwd = process.cwd()) {
		const directory = stateDirectory(cwd);
		const versions = new Set(
			readdirSync(directory)
				.map(
					(name) =>
						name.match(/^maven-(?<version>.+)\.(?:json|zip)$/u)?.groups?.version
				)
				.filter((version): version is string =>
					Boolean(version && valid(version))
				)
		);
		await Promise.all(
			[...versions].map(async (version) => {
				const journal = join(directory, `maven-${version}.json`);
				if (
					existsSync(journal) &&
					readMavenDeploymentRecord({ cwd, stateFile: journal }).version !==
						version
				) {
					throw new Error(
						'The saved Maven deployment belongs to a different version.'
					);
				}
				if (
					!(await mobileSdkPublished('android', version, cwd)) ||
					!swiftGit(cwd)(
						'ls-remote',
						'--tags',
						'origin',
						`refs/tags/c15t-android@${version}`
					)
				) {
					return;
				}
				rmSync(journal, { force: true });
				rmSync(join(directory, `maven-${version}.zip`), { force: true });
			})
		);
	};

const publishSwift = async function publishSwift(cwd: string, version: string) {
	const prepared = preparedSwift.get(version);
	if (!prepared) {
		throw new Error('Swift publication was not prepared.');
	}
	const git = swiftGit(cwd);
	if (
		git('rev-parse', 'HEAD') !== prepared.commit ||
		nativeSourceDigest(cwd, 'swift') !== prepared.digest
	) {
		throw new Error('Swift release sources changed after preparation.');
	}
	if (await mobileSdkPublished('swift', version, cwd, prepared.digest)) {
		return;
	}
	git('push', 'origin', `${prepared.commit}:refs/tags/${version}`);
	if (!(await mobileSdkPublished('swift', version, cwd, prepared.digest))) {
		throw new Error(
			`Swift tag ${version} was not published to this repository.`
		);
	}
};

/** Publish one prepared SDK. Central validation stays resumable and never polls. */
export const publishMobileSdk = async function publishMobileSdk({
	cwd,
	kind,
	version,
}: {
	cwd: string;
	kind: NativeSdkKind;
	version: string;
}) {
	checkMobilePublishEnvironment(kind);
	if (kind === 'swift') {
		await publishSwift(cwd, version);
		return;
	}
	const stateFile = mavenState(cwd, version);
	let deployment;
	if (existsSync(stateFile)) {
		const saved: unknown = JSON.parse(readFileSync(stateFile, 'utf8'));
		if (
			typeof saved !== 'object' ||
			saved === null ||
			!('version' in saved) ||
			saved.version !== version
		) {
			throw new Error(
				'The saved Maven deployment belongs to a different version.'
			);
		}
		deployment = await getMavenDeployment({ cwd, stateFile });
	} else {
		requireNewMavenUpload(version);
		const bundle = preparedMaven.get(version);
		if (!bundle) {
			throw new Error('Maven publication was not prepared.');
		}
		deployment = await uploadMavenBundle({ bundle, cwd, stateFile, version });
	}
	if (deployment.deploymentState === 'VALIDATED') {
		deployment = await publishMavenDeployment({ cwd, stateFile });
	}
	if (deployment.deploymentState !== 'PUBLISHED') {
		throw new Error(
			`Maven Central is ${deployment.deploymentState}. Resume this release with its saved state after validation/publication completes.`
		);
	}
};

/** Refuse an RN npm upload until every pinned Android module is publicly resolvable. */
export const checkReactNativeMavenPublication =
	async function checkReactNativeMavenPublication(cwd: string) {
		const source = readFileSync(
			join(
				cwd,
				'packages/react-native/android/c15t-react-native/library.gradle'
			),
			'utf8'
		);
		const matches = [
			...source.matchAll(
				/String coreVersion = prop\('c15t\.core\.version'\) \?: '(?<version>[^']+)'/gu
			),
		];
		const version = matches[0]?.groups?.version;
		if (matches.length !== 1 || !version || valid(version) !== version) {
			throw new Error(
				'The RN adapter must pin one valid native Android version.'
			);
		}
		if (!(await mobileSdkPublished('android', version, cwd))) {
			throw new Error(
				`Publish all three native Android ${version} artifacts to Maven Central before releasing @c15t/react-native to npm.`
			);
		}
	};

if (import.meta.main) {
	if (process.argv[2] !== 'prune-state') {
		throw new Error(
			'Choose prune-state to remove completed native retry files.'
		);
	}
	await pruneCompletedMobileReleaseState();
}
