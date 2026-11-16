import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PackagePublishTask, tegami } from 'tegami';
import type { PublishPlan, PublishTaskRunContext, TegamiPlugin } from 'tegami';
import { github } from 'tegami/plugins/github';

import { NativeSdk, nativeSourceDigest } from './native-sdk-package';
import {
	publishMobileSdk,
	mobileSdkPublished,
	checkMobilePublishEnvironment,
	checkMobileReleaseInputs,
	prepareMobileSdk,
	nativeTestEnvironment,
} from './publish-mobile';
import { syncVendoredCore } from './sync-vendored-core';
import {
	checkReleaseVersion,
	nextVersion,
	releaseLine,
	renderVersionPrBody,
	runReleaseCli,
} from './tegami';

export { nativeSourceDigest } from './native-sdk-package';

export type NativeSdkKind = 'swift' | 'android';

const swiftVersionPath = 'native/core-swift/Sources/C15tCore/Transports.swift';
const androidProtocolPath =
	'native/core-android/c15t-core/src/main/kotlin/com/c15t/core/transport/C15tProtocol.kt';
const androidPropertiesPath = 'native/core-android/gradle.properties';
const rnPropertiesPath = 'packages/react-native/android/gradle.properties';
const rnLibraryPath =
	'packages/react-native/android/c15t-react-native/library.gradle';

const readMatch = function readMatch(
	cwd: string,
	path: string,
	expression: RegExp
) {
	const matches = [
		...readFileSync(join(cwd, path), 'utf8').matchAll(expression),
	];
	const value = matches[0]?.[1];
	if (matches.length !== 1 || !value) {
		throw new Error(`Expected one SDK version in ${path}.`);
	}
	return value;
};

const replaceVersion = function replaceVersion(
	cwd: string,
	path: string,
	expression: RegExp,
	version: string
) {
	const previous = readMatch(cwd, path, expression);
	const content = readFileSync(join(cwd, path), 'utf8');
	writeFileSync(
		join(cwd, path),
		content.replace(expression, (match: string) =>
			match.replace(previous, version)
		)
	);
};

/** Read the native version and reject Android consumer pins that have drifted. */
export const readNativeVersion = function readNativeVersion(
	cwd: string,
	kind: NativeSdkKind
) {
	if (kind === 'swift') {
		return readMatch(
			cwd,
			swiftVersionPath,
			/public static let version = "(?<version>[^"]+)"/gu
		);
	}
	const version = readMatch(
		cwd,
		androidPropertiesPath,
		/^c15t\.native\.version=(?<version>.+)$/gmu
	);
	for (const [path, expression] of [
		[androidProtocolPath, /DEFAULT_SDK_VERSION = "(?<version>[^"]+)"/gu],
		[rnPropertiesPath, /^c15t\.core\.version=(?<version>.+)$/gmu],
		[
			rnLibraryPath,
			/String coreVersion = prop\('c15t\.core\.version'\) \?: '(?<version>[^']+)'/gu,
		],
	] as const) {
		if (readMatch(cwd, path, expression) !== version) {
			throw new Error(`Native Android version differs from ${path}.`);
		}
	}
	return version;
};

/** Update request metadata and the generated/pinned RN consumer inputs together. */
export const writeNativeVersion = function writeNativeVersion(
	cwd: string,
	kind: NativeSdkKind,
	version: string
) {
	readNativeVersion(cwd, kind);
	if (kind === 'swift') {
		replaceVersion(
			cwd,
			swiftVersionPath,
			/public static let version = "(?<version>[^"]+)"/gu,
			version
		);
		syncVendoredCore({
			sourceDir: join(cwd, 'native/core-swift/Sources/C15tCore'),
			targetDir: join(cwd, 'packages/react-native/vendor/C15tCore'),
		});
		return;
	}
	for (const [path, expression] of [
		[androidPropertiesPath, /^c15t\.native\.version=(?<version>.+)$/gmu],
		[androidProtocolPath, /DEFAULT_SDK_VERSION = "(?<version>[^"]+)"/gu],
		[rnPropertiesPath, /^c15t\.core\.version=(?<version>.+)$/gmu],
		[
			rnLibraryPath,
			/String coreVersion = prop\('c15t\.core\.version'\) \?: '(?<version>[^']+)'/gu,
		],
	] as const) {
		replaceVersion(cwd, path, expression, version);
	}
};

interface NativeLockRecord {
	id: string;
	branch: string;
	version: string;
	digest: string;
}

const isNativeLock = function isNativeLock(
	value: unknown
): value is NativeLockRecord {
	return (
		typeof value === 'object' &&
		value !== null &&
		'id' in value &&
		typeof value.id === 'string' &&
		'branch' in value &&
		typeof value.branch === 'string' &&
		'version' in value &&
		typeof value.version === 'string' &&
		'digest' in value &&
		typeof value.digest === 'string'
	);
};

const checkNativeLock = function checkNativeLock(
	cwd: string,
	branch: string,
	pkg: NativeSdk,
	record: NativeLockRecord | undefined
) {
	if (record?.branch !== branch) {
		throw new Error('Native publish lock does not match its release branch.');
	}
	if (
		record.version !== pkg.version ||
		record.digest !== nativeSourceDigest(cwd, pkg.kind)
	) {
		throw new Error(
			`Native publish lock source/version mismatch for ${pkg.id}.`
		);
	}
	checkReleaseVersion(branch, pkg.version);
};

const checkLocalAndroidTag = function checkLocalAndroidTag(
	cwd: string,
	version: string
) {
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
	const tag = `c15t-android@${version}`;
	if (
		git('tag', '--list', tag) &&
		git('rev-parse', `${tag}^{commit}`) !== git('rev-parse', 'HEAD')
	) {
		throw new Error(
			`Unpushed Android tag ${tag} differs from the checked release commit. Recover its exact source commit; never replace the tag.`
		);
	}
};

const checkRemoteAndroidTag = function checkRemoteAndroidTag(
	cwd: string,
	record: NativeLockRecord
) {
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
	const tag = `c15t-android@${record.version}`;
	const ref = `refs/tags/${tag}`;
	if (!git('ls-remote', '--tags', 'origin', ref)) {
		return false;
	}
	git('fetch', '--quiet', '--no-tags', 'origin', ref);
	const commit = git('rev-parse', 'FETCH_HEAD^{commit}');
	const root = mkdtempSync(join(tmpdir(), 'c15t-android-tag-'));
	const source = join(root, 'source');
	let added = false;
	try {
		git(
			'-c',
			'core.hooksPath=/dev/null',
			'worktree',
			'add',
			'--quiet',
			'--detach',
			source,
			commit
		);
		added = true;
		if (
			readNativeVersion(source, 'android') !== record.version ||
			nativeSourceDigest(source, 'android') !== record.digest
		) {
			throw new Error(
				`Android tag ${tag} differs from the recorded native release sources. Never replace a published tag.`
			);
		}
		return true;
	} finally {
		if (added) {
			git('worktree', 'remove', '--force', source);
		}
		rmSync(root, { force: true, recursive: true });
	}
};

class NativePublishTask extends PackagePublishTask<NativeSdk> {
	readonly record: NativeLockRecord;
	constructor(pkg: NativeSdk, record: NativeLockRecord) {
		super(pkg);
		this.record = record;
	}
	async status({ context }: PublishTaskRunContext) {
		return (await mobileSdkPublished(
			this.pkg.kind,
			this.record.version,
			context.cwd,
			this.record.digest
		))
			? 'done'
			: 'pending';
	}
	async publish(options: PublishTaskRunContext) {
		if ((await this.status(options)) === 'done') {
			return { type: 'skipped' } as const;
		}
		const { context } = options;
		await publishMobileSdk({
			cwd: context.cwd,
			kind: this.pkg.kind,
			version: this.pkg.version,
		});
		return { type: 'published' } as const;
	}
}

const nativePlugin = function nativePlugin(
	branch: string,
	verifyNativeTests: boolean
): TegamiPlugin {
	const previousVersions = new Map<string, string>();
	const planRecords = new WeakMap<PublishPlan, Map<string, NativeLockRecord>>();
	const publishedPackages = new WeakMap<PublishPlan, Set<string>>();
	return {
		applyDraft(draft) {
			for (const pkg of this.graph.getPackages()) {
				if (!(pkg instanceof NativeSdk)) {
					continue;
				}
				const version = draft.getPackageDraft(pkg.id)?.bumpVersion(pkg);
				if (!version || version === pkg.version) {
					continue;
				}
				checkReleaseVersion(branch, version);
				writeNativeVersion(this.cwd, pkg.kind, version);
				pkg.version = version;
			}
		},
		beforePublishAll({ plan }) {
			const records = planRecords.get(plan);
			const pending = plan
				.getPackagesToPublish()
				.filter(
					(pkg): pkg is NativeSdk =>
						pkg instanceof NativeSdk &&
						!publishedPackages.get(plan)?.has(pkg.id)
				);
			for (const pkg of pending) {
				const record = records?.get(pkg.id);
				checkNativeLock(this.cwd, branch, pkg, record);
				if (pkg.kind === 'android') {
					checkLocalAndroidTag(this.cwd, pkg.version);
				}
			}
			if (plan.options.dryRun) {
				return;
			}
			for (const pkg of pending) {
				checkMobilePublishEnvironment(pkg.kind);
			}
			// Normal CI validates the branch checkout. Recovery publishes a historical
			// source commit, so test its pending Android sources before any preparation.
			if (verifyNativeTests && pending.some((pkg) => pkg.kind === 'android')) {
				execFileSync(
					'sh',
					[
						join(this.cwd, 'native/core-android/gradlew'),
						':c15t-core:test',
						':c15t-android:testDebugUnitTest',
						':c15t-consent-ui:testDebugUnitTest',
						'--no-daemon',
						'--no-configuration-cache',
						'--console=plain',
					],
					{
						cwd: join(this.cwd, 'native/core-android'),
						env: nativeTestEnvironment(),
						stdio: 'inherit',
					}
				);
			}
			for (const pkg of pending) {
				prepareMobileSdk({
					cwd: this.cwd,
					kind: pkg.kind,
					version: pkg.version,
				});
			}
		},
		enforce: 'post',
		initDraft(draft) {
			for (const pkg of this.graph.getPackages()) {
				previousVersions.set(pkg.id, pkg.version ?? '');
				draft.dispatchPackage(pkg, (entry) => {
					const original = entry.bumpVersion;
					entry.bumpVersion = (current) =>
						entry.type && current.version
							? nextVersion(current.version, entry.type, entry.prerelease)
							: original.call(entry, current);
				});
			}
		},
		initPublishLock({ lock }) {
			for (const pkg of this.graph.getPackages()) {
				if (
					!(pkg instanceof NativeSdk) ||
					previousVersions.get(pkg.id) === pkg.version
				) {
					continue;
				}
				lock.write('c15t:native', {
					branch,
					digest: nativeSourceDigest(this.cwd, pkg.kind),
					id: pkg.id,
					version: pkg.version,
				});
			}
		},
		initPublishPlan({ lock, plan }) {
			const records = new Map<string, NativeLockRecord>();
			let entry: unknown;
			while ((entry = lock.read('c15t:native'))) {
				if (!isNativeLock(entry) || records.has(entry.id)) {
					throw new Error(
						'Native publish lock does not match its release branch.'
					);
				}
				records.set(entry.id, entry);
			}
			planRecords.set(plan, records);
			publishedPackages.set(plan, new Set());
			for (const [id, packagePlan] of plan.packages) {
				const pkg = this.graph.get(id);
				if (!(pkg instanceof NativeSdk) || !packagePlan.updated) {
					continue;
				}
				const record = records.get(id);
				if (!record) {
					throw new Error(
						`Native publish lock source/version mismatch for ${id}.`
					);
				}
				packagePlan.git = {
					tag:
						pkg.kind === 'swift'
							? record.version
							: `${pkg.name}@${record.version}`,
				};
			}
		},
		name: 'c15t-native-releases',
		async publishPreflight({ pkg, plan }) {
			if (pkg instanceof NativeSdk) {
				const record = planRecords.get(plan)?.get(pkg.id);
				if (!record) {
					return { shouldPublish: false };
				}
				if (
					await mobileSdkPublished(
						pkg.kind,
						record.version,
						this.cwd,
						record.digest
					)
				) {
					if (
						pkg.kind === 'android' &&
						!checkRemoteAndroidTag(this.cwd, record)
					) {
						checkNativeLock(this.cwd, branch, pkg, record);
						checkMobileReleaseInputs(this.cwd, pkg.kind);
						checkLocalAndroidTag(this.cwd, record.version);
					}
					publishedPackages.get(plan)?.add(pkg.id);
				}
				return { shouldPublish: true };
			}
		},
		publishTasks({ plan }) {
			return plan.getPackagesToPublish().map((pkg) => {
				const record = planRecords.get(plan)?.get(pkg.id);
				return (
					pkg instanceof NativeSdk &&
					record &&
					new NativePublishTask(pkg, record)
				);
			});
		},
		resolve() {
			// Native releases have their own lock and version PR. npm keeps its OIDC workflow.
			// Its adapter also caches a graph and writes every manifest on apply.
			delete this.npm;
			for (const pkg of this.graph.getPackages()) {
				this.graph.delete(pkg.id);
			}
			for (const kind of ['swift', 'android'] as const) {
				this.graph.add(
					new NativeSdk(this.cwd, kind, readNativeVersion(this.cwd, kind))
				);
			}
		},
	};
};

/** Create the independent native release flow without changing npm release locks. */
export const createMobileRelease = function createMobileRelease({
	cwd = process.cwd(),
	branch,
	github: withGithub = true,
	verifyNativeTests = false,
}: {
	cwd?: string;
	branch: string;
	github?: boolean;
	verifyNativeTests?: boolean;
}) {
	const line = releaseLine(branch);
	return tegami({
		changelogDir: '.tegami/mobile',
		cwd,
		packages: () => ({ prerelease: line.prerelease }),
		plugins: [
			nativePlugin(branch, verifyNativeTests),
			...(withGithub
				? github({
						repo: 'c15t/c15t',
						versionPr: {
							base: branch,
							branch: `tegami/version-mobile-${branch}`,
							create(options) {
								return { body: renderVersionPrBody(this.graph, options) };
							},
						},
					})
				: []),
		],
	});
};

if (import.meta.main) {
	const branch =
		process.env.GITHUB_BASE_REF ||
		process.env.GITHUB_REF_NAME ||
		process.env.RELEASE_BRANCH ||
		execFileSync('git', ['branch', '--show-current'], {
			encoding: 'utf8',
		}).trim();
	await runReleaseCli(createMobileRelease({ branch }));
}
