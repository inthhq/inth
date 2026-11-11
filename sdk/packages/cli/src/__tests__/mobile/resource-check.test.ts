import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
	buildConsentManifestFromConfig,
	policyRulePresets,
} from '@c15t/schema';
import { describe, expect, it } from 'vitest';

import { bundleMobileManifest } from '~/mobile/bundle-manifest';
import { exportMobilePolicy } from '~/mobile/export-manifest';
import { resourceProblem } from '~/mobile/resource-check';

const protocol = resolve(import.meta.dirname, '../../../../../native/protocol');
const read = (path: string) =>
	JSON.parse(readFileSync(join(protocol, path), 'utf8'));
const malformed = read('bundled-policy/invalid-resources.json') as {
	cases: { name: string; endpoint: string; now: number; resource: unknown }[];
};

describe('the native resource check', () => {
	it('accepts the shared resources both native cores load', () => {
		for (const name of ['parity', 'iab']) {
			const source = read(`bundled-policy/${name}.json`);
			expect(
				resourceProblem(JSON.stringify(source.resource), source),
				name
			).toBeNull();
		}
	});

	it('finds a problem in every resource a native core refuses or loads without a vendor list', () => {
		const missed = malformed.cases.filter(
			(entry) => resourceProblem(JSON.stringify(entry.resource), entry) === null
		);
		expect(missed.map((entry) => entry.name)).toEqual([]);
	});
});

describe('export and reuse never produce a resource a device discards', () => {
	const now = Date.parse('2026-11-10T00:00:00Z');
	const endpoint = 'https://fixture.example.test';
	const serve = (body: unknown) => () =>
		Promise.resolve(new Response(JSON.stringify(body)));

	it('refuses a manifest with an empty revision', async () => {
		const manifest = await buildConsentManifestFromConfig({
			policyRules: [policyRulePresets.europeOptIn()],
		});
		await expect(
			exportMobilePolicy({
				endpoint,
				expiresAt: now + 86_400_000,
				fetch: serve({ ...manifest, revision: '' }),
				now,
			})
		).rejects.toThrow(/non-empty revision/u);
	});

	it.each([
		{ tcfPolicyVersion: 0 },
		{ vendorListVersion: 0 },
		{ purposes: 'all' },
		{ vendors: { 755: 'bad' } },
	])('refuses a vendor list a device would discard: %o', async (patch) => {
		const source = read('iab/additional-consent-cases.json');
		const manifest = await buildConsentManifestFromConfig({
			iab: { enabled: true, endpoint: 'https://lists.example.test/gvl' },
			policyRules: [policyRulePresets.europeIab()],
		});
		const gvl = {
			...source.gvl,
			lastUpdated: new Date(now - 86_400_000).toISOString(),
			...patch,
		};
		await expect(
			exportMobilePolicy({
				endpoint,
				expiresAt: now + 86_400_000,
				fetch: (url) =>
					Promise.resolve(
						new Response(
							JSON.stringify(String(url).endsWith('/manifest') ? manifest : gvl)
						)
					),
				now,
			})
		).rejects.toThrow(/GVL requires/u);
	});

	it('does not reuse a stale copy a device would discard', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'c15t-stale-'));
		try {
			const out = join(directory, 'c15t-policy.json');
			const entry = malformed.cases.find(
				(each) => each.name === 'empty manifest revision'
			);
			await writeFile(out, JSON.stringify(entry?.resource));
			await expect(
				bundleMobileManifest({
					allowStaleManifest: true,
					backendUrl: entry?.endpoint ?? '',
					build: 'release',
					fetch: () => Promise.reject(new TypeError('fetch failed')),
					now: entry?.now,
					out,
				})
			).rejects.toThrow(/release build/u);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});
});
