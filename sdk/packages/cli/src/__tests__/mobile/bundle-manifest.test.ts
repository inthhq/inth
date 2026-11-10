import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	buildConsentManifestFromConfig,
	policyRulePresets,
} from '@c15t/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mobileManifest } from '~/commands/mobile-manifest';
import type { CliContext } from '~/context/types';
import { bundleMobileManifest } from '~/mobile/bundle-manifest';

const now = Date.parse('2026-11-10T00:00:00Z');
const backendUrl = 'https://fixture.example.test';
const online = async () => {
	const manifest = await buildConsentManifestFromConfig({
		policyRules: [policyRulePresets.europeOptIn()],
	});
	return () => Promise.resolve(new Response(JSON.stringify(manifest)));
};
const offline = () => Promise.reject(new TypeError('fetch failed'));

let directory: string;
let out: string;
beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'c15t-manifest-'));
	out = join(directory, 'c15t-policy.json');
});
afterEach(() => rm(directory, { force: true, recursive: true }));

describe('bundling the manifest at build time', () => {
	it('writes the fetched manifest with an expiry in days', async () => {
		const result = await bundleMobileManifest({
			backendUrl: `${backendUrl}/`,
			build: 'release',
			expiresInDays: 7,
			fetch: await online(),
			now,
			out,
		});
		expect(result).toEqual({
			expiresAt: now + 7 * 86_400_000,
			out,
			status: 'fetched',
		});
		const payload = JSON.parse(JSON.parse(await readFile(out, 'utf8')).payload);
		expect(payload.endpoint).toBe(backendUrl);
		expect(payload.expiresAt).toBe(now + 7 * 86_400_000);
	});

	it('fails a release build when the fetch fails', async () => {
		await expect(
			bundleMobileManifest({
				backendUrl,
				build: 'release',
				fetch: offline,
				now,
				out,
			})
		).rejects.toThrow(/release build/u);
	});

	it('warns and continues for a debug build when the fetch fails', async () => {
		const result = await bundleMobileManifest({
			backendUrl,
			build: 'debug',
			fetch: offline,
			now,
			out,
		});
		expect(result.status).toBe('skipped');
	});

	it('reuses the last fetched copy, even an expired one, with allowStaleManifest', async () => {
		await bundleMobileManifest({
			backendUrl,
			build: 'release',
			expiresInDays: 1,
			fetch: await online(),
			now,
			out,
		});
		const copy = await readFile(out, 'utf8');
		const result = await bundleMobileManifest({
			allowStaleManifest: true,
			backendUrl,
			build: 'release',
			fetch: offline,
			now: now + 10 * 86_400_000,
			out,
		});
		expect(result.status).toBe('reused');
		expect(await readFile(out, 'utf8')).toBe(copy);
	});

	it('does not reuse a corrupt copy or one for another backend', async () => {
		await writeFile(out, '{"payload":"{}","sha256":"0"}');
		await expect(
			bundleMobileManifest({
				allowStaleManifest: true,
				backendUrl,
				build: 'release',
				fetch: offline,
				now,
				out,
			})
		).rejects.toThrow(/release build/u);
		await bundleMobileManifest({
			backendUrl: 'https://other.example.test',
			build: 'release',
			fetch: await online(),
			now,
			out,
		});
		await expect(
			bundleMobileManifest({
				allowStaleManifest: true,
				backendUrl,
				build: 'release',
				fetch: offline,
				now,
				out,
			})
		).rejects.toThrow(/release build/u);
	});
});

describe('c15t mobile-manifest', () => {
	const context = (flags: Record<string, string | boolean>) =>
		({
			cwd: directory,
			flags,
			logger: { success: vi.fn(), warn: vi.fn() },
		}) as unknown as CliContext;

	it('passes flags through and defaults to a release build', async () => {
		const run = vi.fn(() =>
			Promise.resolve({ status: 'skipped' as const, warning: 'offline' })
		);
		const ctx = context({
			'allow-stale-manifest': true,
			'backend-url': backendUrl,
			languages: 'en, fr',
			vendors: '1,2',
		});
		await mobileManifest(ctx, run);
		expect(run).toHaveBeenCalledWith({
			allowStaleManifest: true,
			backendUrl,
			build: 'release',
			expiresInDays: undefined,
			languages: ['en', 'fr'],
			out: join(directory, 'c15t-policy.json'),
			vendors: [1, 2],
		});
		expect(ctx.logger.warn).toHaveBeenCalledWith('offline');
	});

	it('refuses a missing backend URL and an unknown build type', async () => {
		await expect(mobileManifest(context({}))).rejects.toThrow();
		await expect(
			mobileManifest(context({ 'backend-url': backendUrl, build: 'staging' }))
		).rejects.toThrow();
	});
});
