import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
	copyFile,
	mkdir,
	mkdtemp,
	realpath,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IOSConfig } from 'expo/config-plugins';
import { describe, expect, it, vi } from 'vite-plus/test';

import {
	fetchBundledManifest,
	manifestArguments,
	manifestBuild,
	resolveCli,
} from '../bundle-manifest';
import { resolveParams } from '../params';
import {
	embedPolicyResource,
	POLICY_RESOURCE_NAME,
	removeXcodeResource,
} from '../policy-resource';
import { applyToFixture, FIXTURE_DIR, runMod } from './helpers';

const projectUrl = 'https://acme.inth.app';
const settings = {
	allowStaleManifest: true,
	dryRun: false,
	expiresInDays: 14,
	languages: ['en', 'de'],
	out: 'inth-policy.json',
	vendors: [755, 42],
};

const exitingWith = (code: number) =>
	vi.fn(() => {
		const child = {
			once(event: string, listener: (value: number) => void) {
				if (event === 'close') {
					queueMicrotask(() => listener(code));
				}
				return child;
			},
		};
		return child as never;
	});

describe('bundling the manifest at prebuild', () => {
	it('treats builds as release unless expo run says debug', () => {
		expect(manifestBuild(['node', 'expo', 'prebuild'], {})).toBe('release');
		expect(manifestBuild(['node', 'eas', 'build'], { EAS_BUILD: 'true' })).toBe(
			'release'
		);
		expect(manifestBuild(['node', 'expo', 'run:android'], {})).toBe('debug');
		expect(
			manifestBuild(['node', 'expo', 'run:android', '--variant', 'release'], {})
		).toBe('release');
		expect(
			manifestBuild(['node', 'expo', 'run:ios', '--configuration=Release'], {})
		).toBe('release');
		expect(
			manifestBuild(['node', 'expo', 'prebuild'], {
				INTH_MANIFEST_BUILD: 'debug',
			})
		).toBe('debug');
	});

	it.each([
		[['run:ios', '--configuration', 'Production'], 'release'],
		[['run:ios', '--configuration=Staging'], 'release'],
		[['run:android', '--variant', 'production'], 'release'],
		[['run:android', '--variant=demoRelease'], 'release'],
		[['run:android', '--variant'], 'release'],
		[['run:ios', '--configuration', 'Debug'], 'debug'],
		[['run:android', '--variant=demoDebug'], 'debug'],
		[['run:android', '--variant', 'freeDebug'], 'debug'],
	] as const)(
		'treats an explicit variant or configuration as release unless it names debug: %o',
		(flags, build) => {
			expect(manifestBuild(['node', 'expo', ...flags], {})).toBe(build);
		}
	);

	it('passes the build type and stale-copy setting to c15t mobile-manifest', () => {
		expect(
			manifestArguments(
				projectUrl,
				settings,
				'/app/inth-policy.json',
				'release'
			)
		).toEqual([
			'mobile-manifest',
			'--backend-url',
			projectUrl,
			'--out',
			'/app/inth-policy.json',
			'--build',
			'release',
			'--allow-stale-manifest',
			'--expires-in-days',
			'14',
			'--languages',
			'en,de',
			'--vendors',
			'755,42',
		]);
		expect(
			resolveParams({ bundleManifest: true, projectUrl, vendors: [755, 42] })
				.bundleManifest?.vendors
		).toEqual([755, 42]);
	});

	it('fails the prebuild when the CLI fails, and runs it once per build', async () => {
		const failing = exitingWith(1);
		await expect(
			fetchBundledManifest('/app-a', projectUrl, settings, 'release', {
				resolveCli: () => '/bin/inth',
				spawn: failing,
			})
		).rejects.toThrow(/could not fetch the manifest for this release build/u);
		const passing = exitingWith(0);
		const deps = { resolveCli: () => '/bin/inth', spawn: passing };
		await fetchBundledManifest('/app-b', projectUrl, settings, 'debug', deps);
		await fetchBundledManifest('/app-b', projectUrl, settings, 'debug', deps);
		expect(passing).toHaveBeenCalledTimes(1);
	});

	it('needs @c15t/cli installed in the app', async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), 'inth-cli-')));
		try {
			await writeFile(join(root, 'package.json'), '{}');
			expect(() => resolveCli(root)).toThrow(
				/Add @c15t\/cli to devDependencies/u
			);
			await mkdir(join(root, 'node_modules/@c15t/cli'), { recursive: true });
			await writeFile(
				join(root, 'node_modules/@c15t/cli/package.json'),
				JSON.stringify({ bin: { c15t: 'dist/bin.mjs' }, name: '@c15t/cli' })
			);
			expect(resolveCli(root)).toBe(
				join(root, 'node_modules/@c15t/cli/dist/bin.mjs')
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('replaces policyResource and does not mix with an in-code policy', () => {
		const resolved = resolveParams({ bundleManifest: true, projectUrl });
		expect(resolved.policyResource).toBe('inth-policy.json');
		expect(resolved.bundleManifest?.allowStaleManifest).toBe(false);
		expect(() =>
			resolveParams({
				bundleManifest: true,
				policyResource: 'x.json',
				projectUrl,
			})
		).toThrow(/remove policyResource/u);
		expect(() =>
			resolveParams({ bundleManifest: { expiresInDays: 0 }, projectUrl })
		).toThrow(/expiresInDays/u);
		expect(() =>
			resolveParams({
				bundleManifest: true,
				policy: { rules: [] },
				projectUrl,
			})
		).toThrow(/policy cannot be combined with bundleManifest/u);
	});

	it('rejects a resource that expires before it was issued, and embeds a merely expired one', async () => {
		const root = await mkdtemp(join(tmpdir(), 'inth-dates-'));
		try {
			const write = async (
				name: string,
				issuedAt: number,
				expiresAt: number
			) => {
				const payload = JSON.stringify({
					defaultLanguage: 'en',
					endpoint: projectUrl,
					expiresAt,
					issuedAt,
					manifestRevision: 'r1',
					policyPacks: [{}],
					schemaVersion: 1,
				});
				await writeFile(
					join(root, name),
					JSON.stringify({
						payload,
						sha256: createHash('sha256').update(payload).digest('hex'),
					})
				);
			};
			const now = Date.now();
			await write('impossible.json', now - 1000, now - 2000);
			await write('expired.json', now - 2000, now - 1000);
			await expect(
				embedPolicyResource(
					root,
					'impossible.json',
					projectUrl,
					join(root, 'out.json')
				)
			).rejects.toThrow(/expires before it was issued/u);
			const warn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined);
			await embedPolicyResource(
				root,
				'expired.json',
				projectUrl,
				join(root, 'out.json')
			);
			warn.mockRestore();
			expect(existsSync(join(root, 'out.json'))).toBe(true);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('removes a resource from an Expo Xcode project without a Resources group', async () => {
		const root = await mkdtemp(join(tmpdir(), 'inth-pbx-'));
		try {
			await mkdir(join(root, 'ios/InthBare.xcodeproj'), { recursive: true });
			await copyFile(
				join(FIXTURE_DIR, 'project.pbxproj'),
				join(root, 'ios/InthBare.xcodeproj/project.pbxproj')
			);
			const original = IOSConfig.XcodeUtils.getPbxproj(root);
			const before = original.writeSync();
			const added = IOSConfig.XcodeUtils.addResourceFileToGroup({
				filepath: `InthBare/${POLICY_RESOURCE_NAME}`,
				groupName: 'InthBare',
				isBuildFile: true,
				project: original,
			});
			expect(added.writeSync()).toContain(POLICY_RESOURCE_NAME);
			expect(
				removeXcodeResource(
					added,
					`InthBare/${POLICY_RESOURCE_NAME}`
				).writeSync()
			).toBe(before);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('removes the copies an earlier build embedded when a debug fetch is skipped', async () => {
		const root = await mkdtemp(join(tmpdir(), 'inth-skip-'));
		try {
			// A CLI that writes nothing and succeeds: a debug build that could not
			// reach the backend, without allowStaleManifest.
			await mkdir(join(root, 'node_modules/@c15t/cli'), { recursive: true });
			await writeFile(join(root, 'package.json'), '{}');
			await writeFile(
				join(root, 'node_modules/@c15t/cli/package.json'),
				JSON.stringify({ bin: { c15t: 'bin.mjs' }, name: '@c15t/cli' })
			);
			await writeFile(
				join(root, 'node_modules/@c15t/cli/bin.mjs'),
				'process.exit(0);\n'
			);
			const iosCopy = join(root, 'ios/InthBare', POLICY_RESOURCE_NAME);
			const androidCopy = join(
				root,
				'android/app/src/main/assets',
				POLICY_RESOURCE_NAME
			);
			await mkdir(join(root, 'ios/InthBare.xcodeproj'), { recursive: true });
			await mkdir(join(root, 'ios/InthBare'), { recursive: true });
			await mkdir(join(root, 'android/app/src/main/assets'), {
				recursive: true,
			});
			await writeFile(iosCopy, 'stale');
			await writeFile(androidCopy, 'stale');
			await copyFile(
				join(FIXTURE_DIR, 'project.pbxproj'),
				join(root, 'ios/InthBare.xcodeproj/project.pbxproj')
			);
			const project = IOSConfig.XcodeUtils.addResourceFileToGroup({
				filepath: `InthBare/${POLICY_RESOURCE_NAME}`,
				groupName: 'InthBare',
				isBuildFile: true,
				project: IOSConfig.XcodeUtils.getPbxproj(root),
			});
			const config = applyToFixture(
				{ bundleManifest: true, projectUrl },
				{ argv: ['node', 'expo', 'run:ios'], projectRoot: root }
			);
			const ios = await runMod(config, 'ios', 'xcodeproj', project, {
				projectName: 'InthBare',
				projectRoot: root,
			});
			await runMod(config, 'android', 'dangerous', {}, { projectRoot: root });
			expect(existsSync(iosCopy)).toBe(false);
			expect(existsSync(androidCopy)).toBe(false);
			expect((ios.modResults as typeof project).writeSync()).not.toContain(
				POLICY_RESOURCE_NAME
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
