import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	buildConsentManifestFromConfig,
	policyRulePresets,
} from '../packages/sdk/schema/dist/index.js';
import { exportMobilePolicy } from './export-mobile-policy';

const now = Date.parse('2026-10-29T00:00:00Z');
const endpoint = 'https://fixture.example.test';
const options = { endpoint, expiresAt: now + 86400000, now };
const manifest = () =>
	buildConsentManifestFromConfig({
		policyRules: [policyRulePresets.europeOptIn()],
	});

describe('native build policy export', () => {
	it('validates the canonical manifest and carries no visitor data', async () => {
		const m = {
			...(await manifest()),
			policySnapshotToken: 'must-not-ship',
			records: { receipt: 'must-not-ship' },
			subjectId: 'must-not-ship',
		};
		const wrapped = JSON.parse(
			await exportMobilePolicy({
				...options,
				fetch: () => Promise.resolve(new Response(JSON.stringify(m))),
			})
		);
		expect(wrapped.sha256).toBe(
			createHash('sha256').update(wrapped.payload).digest('hex')
		);
		expect(wrapped.payload).not.toContain('must-not-ship');
		const body = JSON.parse(wrapped.payload);
		expect(body.manifestRevision).toBe(m.revision);
		expect(body.policyPacks[0].policyResolution.fingerprints).toEqual(
			m.policyPacks?.[0]?.fingerprints
		);
		expect(body.expiresAt).toBe(options.expiresAt);
	});
	it('rejects bad manifests, missing conservative defaults, redirects, credentials and non-TLS', async () => {
		await Promise.all(
			[
				{ schemaVersion: 99 },
				await buildConsentManifestFromConfig({
					policyRules: [policyRulePresets.worldOptOutNoPrompt()],
				}),
			].map(async (body) => {
				await expect(
					exportMobilePolicy({
						...options,
						fetch: () => Promise.resolve(new Response(JSON.stringify(body))),
					})
				).rejects.toThrow();
			})
		);
		await Promise.all(
			['http://unsafe.example.test', 'https://name:password@example.test'].map(
				async (invalidEndpoint) => {
					await expect(
						exportMobilePolicy({ ...options, endpoint: invalidEndpoint })
					).rejects.toThrow('TLS');
				}
			)
		);
		await expect(
			exportMobilePolicy({ ...options, expiresAt: now })
		).rejects.toThrow('future');
	});
	it('preserves original disclosure dates and narrows actual GVL and ATP contents', async () => {
		const source = JSON.parse(
			readFileSync(
				new URL(
					'../packages/native-protocol/iab/additional-consent-cases.json',
					import.meta.url
				),
				'utf8'
			)
		);
		const gvl = {
			...source.gvl,
			lastUpdated: new Date(now - 86400000).toISOString(),
		};
		const m = await buildConsentManifestFromConfig({
			iab: {
				additionalConsent: {
					endpoint: 'https://lists.example.test/atp',
					providers: [1, 2],
				},
				enabled: true,
				endpoint: 'https://lists.example.test/gvl',
			},
			policyRules: [policyRulePresets.europeIab()],
		});
		const resource = JSON.parse(
			await exportMobilePolicy({
				...options,
				fetch: (url) => {
					if (String(url).endsWith('/manifest')) {
						return Promise.resolve(new Response(JSON.stringify(m)));
					}
					return Promise.resolve(
						String(url).includes('/gvl')
							? new Response(JSON.stringify(gvl))
							: new Response(JSON.stringify({ providers: source.providers }), {
									headers: {
										'last-modified': new Date(now - 172800000).toUTCString(),
									},
								})
					);
				},
				vendors: [1],
			})
		);
		const body = JSON.parse(resource.payload);
		expect(body.disclosures.gvl.fetchedAt).toBe(now - 86400000);
		expect(Object.keys(body.disclosures.gvl.data.vendors)).toEqual(['1']);
		expect(body.disclosures.atp.fetchedAt).toBe(now - 172800000);
		expect(
			body.disclosures.atp.providers.map((p: { id: number }) => p.id)
		).toEqual([1, 2]);
		expect(body.requiresAtp).toBe(true);
	});
});

// This config aliases @c15t/schema and @c15t/translations to their sources,
// which hides whether the exporter can find them outside Vitest. The Android
// emulator jobs run this script with tsx, where Node resolves each bare import
// from the importing file's own folder.
describe('exporter dependencies outside Vitest', () => {
	it.each(['export-manifest.ts', 'resource-check.ts'])(
		'%s can resolve every package it imports',
		(file) => {
			const url = new URL(
				`../packages/cli/vendor/c15t-mobile/src/mobile/${file}`,
				import.meta.url
			);
			const packages = [
				...readFileSync(url, 'utf8').matchAll(
					/^import[^;]*?from '(?<specifier>[^.][^']*)'/gmu
				),
			]
				.map((match) => match.groups?.specifier ?? '')
				.filter((specifier) => !specifier.startsWith('node:'));
			expect(packages.length).toBeGreaterThan(0);
			const lookup = createRequire(url).resolve.paths('') ?? [];
			const missing = packages.filter(
				(name) =>
					!lookup.some((dir) => existsSync(join(dir, name, 'package.json')))
			);
			expect(missing).toEqual([]);
		}
	);
});
