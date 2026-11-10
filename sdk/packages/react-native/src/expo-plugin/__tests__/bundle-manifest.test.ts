import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
	fetchBundledManifest,
	manifestArguments,
	manifestBuild,
	resolveCli,
} from '../bundle-manifest';
import { resolveParams } from '../params';

const backendURL = 'https://consent.example.com';
const settings = {
	allowStaleManifest: true,
	expiresInDays: 14,
	languages: ['en', 'de'],
	out: 'c15t-policy.json',
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
		]);
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
});
