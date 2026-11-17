import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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
