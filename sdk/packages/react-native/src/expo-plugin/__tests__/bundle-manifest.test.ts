import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IOSConfig } from '@expo/config-plugins';
import { describe, expect, it, vi } from 'vitest';

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

const backendURL = 'https://consent.example.com';
const settings = {
	allowStaleManifest: true,
	expiresInDays: 14,
	languages: ['en', 'de'],
	out: 'c15t-policy.json',
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
				C15T_MANIFEST_BUILD: 'debug',
			})
		).toBe('debug');
	});

	it('passes the build type and stale-copy setting to c15t mobile-manifest', () => {
		expect(
			manifestArguments(
				backendURL,
				settings,
				'/app/c15t-policy.json',
				'release'
			)
		).toEqual([
			'mobile-manifest',
			'--backend-url',
			backendURL,
			'--out',
			'/app/c15t-policy.json',
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
			resolveParams({ backendURL, bundleManifest: true, vendors: [755, 42] })
				.bundleManifest?.vendors
		).toEqual([755, 42]);
	});

	it('fails the prebuild when the CLI fails, and runs it once per build', async () => {
		const failing = exitingWith(1);
		await expect(
			fetchBundledManifest('/app-a', backendURL, settings, 'release', {
				resolveCli: () => '/bin/c15t',
				spawn: failing,
			})
		).rejects.toThrow(/could not fetch the manifest for this release build/u);
		const passing = exitingWith(0);
		const deps = { resolveCli: () => '/bin/c15t', spawn: passing };
		await fetchBundledManifest('/app-b', backendURL, settings, 'debug', deps);
		await fetchBundledManifest('/app-b', backendURL, settings, 'debug', deps);
		expect(passing).toHaveBeenCalledTimes(1);
	});

	it('needs @c15t/cli installed in the app', async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-cli-'));
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

	it('replaces policyResource and belongs to backend mode', () => {
		const resolved = resolveParams({ backendURL, bundleManifest: true });
		expect(resolved.policyResource).toBe('c15t-policy.json');
		expect(resolved.bundleManifest?.allowStaleManifest).toBe(false);
		expect(() =>
			resolveParams({
				backendURL,
				bundleManifest: true,
				policyResource: 'x.json',
			})
		).toThrow(/remove policyResource/u);
		expect(() =>
			resolveParams({ backendURL, bundleManifest: { expiresInDays: 0 } })
		).toThrow(/expiresInDays/u);
		expect(() =>
			resolveParams({
				bundleManifest: true,
				mode: 'offline',
				policy: { rules: [] },
			})
		).toThrow(/bundleManifest/u);
	});

	it('rejects a resource that expires before it was issued, and embeds a merely expired one', async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-dates-'));
		try {
			const write = async (
				name: string,
				issuedAt: number,
				expiresAt: number
			) => {
				const payload = JSON.stringify({
					endpoint: backendURL,
					expiresAt,
					issuedAt,
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
					backendURL,
					join(root, 'out.json')
				)
			).rejects.toThrow(/expires before it was issued/u);
			const warn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined);
			await embedPolicyResource(
				root,
				'expired.json',
				backendURL,
				join(root, 'out.json')
			);
			warn.mockRestore();
			expect(existsSync(join(root, 'out.json'))).toBe(true);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('removes a resource from an Expo Xcode project without a Resources group', async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-pbx-'));
		try {
			await mkdir(join(root, 'ios/C15tBare.xcodeproj'), { recursive: true });
			await copyFile(
				join(FIXTURE_DIR, 'project.pbxproj'),
				join(root, 'ios/C15tBare.xcodeproj/project.pbxproj')
			);
			const original = IOSConfig.XcodeUtils.getPbxproj(root);
			const before = original.writeSync();
			const added = IOSConfig.XcodeUtils.addResourceFileToGroup({
				filepath: `C15tBare/${POLICY_RESOURCE_NAME}`,
				groupName: 'C15tBare',
				isBuildFile: true,
				project: original,
			});
			expect(added.writeSync()).toContain(POLICY_RESOURCE_NAME);
			expect(
				removeXcodeResource(
					added,
					`C15tBare/${POLICY_RESOURCE_NAME}`
				).writeSync()
			).toBe(before);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it('removes the copies an earlier build embedded when a debug fetch is skipped', async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-skip-'));
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
			const iosCopy = join(root, 'ios/C15tBare', POLICY_RESOURCE_NAME);
			const androidCopy = join(
				root,
				'android/app/src/main/assets',
				POLICY_RESOURCE_NAME
			);
			await mkdir(join(root, 'ios/C15tBare.xcodeproj'), { recursive: true });
			await mkdir(join(root, 'ios/C15tBare'), { recursive: true });
			await mkdir(join(root, 'android/app/src/main/assets'), {
				recursive: true,
			});
			await writeFile(iosCopy, 'stale');
			await writeFile(androidCopy, 'stale');
			await copyFile(
				join(FIXTURE_DIR, 'project.pbxproj'),
				join(root, 'ios/C15tBare.xcodeproj/project.pbxproj')
			);
			const project = IOSConfig.XcodeUtils.addResourceFileToGroup({
				filepath: `C15tBare/${POLICY_RESOURCE_NAME}`,
				groupName: 'C15tBare',
				isBuildFile: true,
				project: IOSConfig.XcodeUtils.getPbxproj(root),
			});
			const config = applyToFixture(
				{ backendURL, bundleManifest: true },
				{ argv: ['node', 'expo', 'run:ios'], projectRoot: root }
			);
			const ios = await runMod(config, 'ios', 'xcodeproj', project, {
				projectName: 'C15tBare',
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
