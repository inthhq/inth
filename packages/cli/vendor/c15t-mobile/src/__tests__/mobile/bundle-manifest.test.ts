import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	buildConsentManifestFromConfig,
	policyRulePresets,
} from '@inth/sdk/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mobileManifest } from '~/commands/mobile-manifest';
import type { CliContext } from '~/context/types';
import { bundleMobileManifest } from '~/mobile/bundle-manifest';
import { ManifestUnreachableError } from '~/mobile/export-manifest';

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

	it.each([
		['no response', offline],
		['503', () => Promise.resolve(new Response('', { status: 503 }))],
	])(
		'warns and continues for a debug build that gets %s, without the old copy',
		async (_name, fetch) => {
			await bundleMobileManifest({
				backendUrl,
				build: 'release',
				fetch: await online(),
				now,
				out,
			});
			const result = await bundleMobileManifest({
				backendUrl,
				build: 'debug',
				fetch,
				now,
				out,
			});
			expect(result.status).toBe('skipped');
			await expect(readFile(out, 'utf8')).rejects.toThrow(/ENOENT/u);
		}
	);

	it.each([
		['a manifest without a fallback', false],
		['a manifest without a fallback', true],
		['a body that is not JSON', false],
		['a body that is not JSON', true],
		['a 404', false],
		['a 404', true],
	] as const)(
		'fails a debug build when a reachable backend serves %s (stale copy allowed: %s)',
		async (name, allowStaleManifest) => {
			// A stale copy is available, and still must not stand in for a refused manifest.
			await bundleMobileManifest({
				backendUrl,
				build: 'release',
				fetch: await online(),
				now,
				out,
			});
			const noFallback = await buildConsentManifestFromConfig({
				policyRules: [policyRulePresets.worldOptOutNoPrompt()],
			});
			const answers = {
				'a 404': () => Promise.resolve(new Response('', { status: 404 })),
				'a body that is not JSON': () =>
					Promise.resolve(new Response('not json')),
				'a manifest without a fallback': () =>
					Promise.resolve(new Response(JSON.stringify(noFallback))),
			};
			await expect(
				bundleMobileManifest({
					allowStaleManifest,
					backendUrl,
					build: 'debug',
					fetch: answers[name],
					now,
					out,
				})
			).rejects.not.toBeInstanceOf(ManifestUnreachableError);
		}
	);

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
	const projectUrl = 'https://acme.inth.app';
	const context = (flags: Record<string, string | boolean>) =>
		({
			cwd: directory,
			flags,
			logger: { success: vi.fn(), warn: vi.fn() },
		}) as unknown as CliContext;
	const skipped = () =>
		vi.fn(() =>
			Promise.resolve({ status: 'skipped' as const, warning: 'offline' })
		);

	it('passes flags through and defaults to a release build', async () => {
		const run = skipped();
		const ctx = context({
			'allow-stale-manifest': true,
			'backend-url': projectUrl,
			languages: 'en, fr',
			vendors: '1,2',
		});
		await mobileManifest(ctx, run);
		expect(run).toHaveBeenCalledWith({
			allowLoopback: false,
			allowStaleManifest: true,
			backendUrl: projectUrl,
			build: 'release',
			expiresInDays: undefined,
			languages: ['en', 'fr'],
			out: join(directory, 'c15t-policy.json'),
			vendors: [1, 2],
		});
		expect(ctx.logger.warn).toHaveBeenCalledWith('offline');
	});

	it('binds the manifest to the normal form of the project URL', async () => {
		const run = skipped();
		await mobileManifest(context({ 'backend-url': ' Acme.Inth.App/// ' }), run);
		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({ backendUrl: projectUrl })
		);
	});

	it.each([
		['https://consent.example.com', 'host'],
		['http://localhost:8787', 'scheme'],
		['https://acme.inth.app/api/c15t', 'path'],
		['https://acme.inth.app:8443', 'port'],
	])('refuses %s without --dry-run', async (url, reason) => {
		const run = skipped();
		await expect(
			mobileManifest(context({ 'backend-url': url }), run)
		).rejects.toMatchObject({
			code: 'FLAG_INVALID',
			context: {
				details: expect.stringContaining(
					`--backend-url must be the project URL from your Inth dashboard, such as https://your-project.inth.app. Got "${url}": `
				),
				reason,
			},
		});
		expect(run).not.toHaveBeenCalled();
	});

	it.each([
		[
			'https://staging.consent.example.com/',
			'https://staging.consent.example.com',
		],
		[
			'http://localhost:8787/api/self-host/',
			'http://localhost:8787/api/self-host',
		],
	])('takes %s with --dry-run', async (url, normalized) => {
		const run = skipped();
		await mobileManifest(context({ 'backend-url': url, 'dry-run': true }), run);
		expect(run).toHaveBeenCalledWith(
			expect.objectContaining({ allowLoopback: true, backendUrl: normalized })
		);
	});

	it('still refuses http off loopback and credentials with --dry-run', async () => {
		for (const [url, reason] of [
			['http://staging.consent.example.com', 'scheme'],
			['https://user:secret@consent.example.com', 'credentials'],
		]) {
			// oxlint-disable-next-line no-await-in-loop -- One URL at a time.
			await expect(
				mobileManifest(
					context({ 'backend-url': url as string, 'dry-run': true }),
					skipped()
				)
			).rejects.toMatchObject({ code: 'FLAG_INVALID', context: { reason } });
		}
	});

	it('fetches a dryRun manifest from a loopback backend over http', async () => {
		const result = await bundleMobileManifest({
			allowLoopback: true,
			backendUrl: 'http://localhost:8787/api/self-host',
			build: 'debug',
			fetch: await online(),
			now,
			out,
		});
		expect(result.status).toBe('fetched');
		const payload = JSON.parse(JSON.parse(await readFile(out, 'utf8')).payload);
		expect(payload.endpoint).toBe('http://localhost:8787/api/self-host');
	});

	it('refuses a missing backend URL and an unknown build type', async () => {
		await expect(mobileManifest(context({}))).rejects.toThrow();
		await expect(
			mobileManifest(context({ 'backend-url': projectUrl, build: 'staging' }))
		).rejects.toThrow();
	});
});
