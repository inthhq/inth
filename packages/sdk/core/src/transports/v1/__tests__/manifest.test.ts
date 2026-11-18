/**
 * Manifest mode on `/v1`: the manifest fetch, local resolution, saves with
 * the decision assertion, and the server-side session report.
 */
import { createConsentManifestPolicyPack } from '@inth/sdk-schema/types';
import type { ConsentManifest } from '@inth/sdk-schema/types';
import { describe, expect, test } from 'vitest';

import { ApiError } from '../error';
import { createV1ManifestTransport } from '../manifest';
import {
	buildV1ConsentSessionReport,
	reportV1ConsentSession,
} from '../session-report';
import {
	bodyAt,
	json,
	PROJECT_URL,
	RECORD,
	savePayload,
	stubFetch,
	SUBJECT,
	v1Error,
} from './fixtures';

const MANIFEST = {
	branding: 'inth',
	policyPacks: [
		createConsentManifestPolicyPack({
			categories: ['*'],
			id: 'eu',
			match: { countries: ['DE'] },
			model: 'opt-in',
			prompt: 'choice',
		}),
	],
	revision: 'rev-1',
	schemaVersion: 2,
} as unknown as ConsentManifest;

const REPORT_INIT = {
	location: { countryCode: null, regionCode: null },
	translations: { language: 'en' },
} as never;

const JOURNEY = {
	id: '3b241101-e2bb-4255-8caf-4136c566a962',
	scope: 'page' as const,
	storedChoice: false,
};

describe('GET /v1/consent/manifest', () => {
	test('fetches the manifest once', async () => {
		const { calls, fetch } = stubFetch(() => json(200, MANIFEST));
		const transport = createV1ManifestTransport({
			fetch,
			projectUrl: PROJECT_URL,
		});

		const first = await transport.init({
			overrides: { country: 'DE' },
			user: null,
		});
		await transport.init({ overrides: { country: 'DE' }, user: null });

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/consent/manifest`);
		expect(calls[0]?.init.method).toBe('GET');
		expect(calls[0]?.headers).toEqual({ accept: 'application/json' });
		expect(first.location).toEqual({ countryCode: 'DE', regionCode: null });
	});

	test('a failed fetch throws the code and request ID, and the next init fetches again', async () => {
		const { calls, fetch } = stubFetch(
			() => v1Error(503, 'server_error', 'req_manifest'),
			() => json(200, MANIFEST)
		);
		const transport = createV1ManifestTransport({
			fetch,
			projectUrl: PROJECT_URL,
		});

		const error = await transport
			.init({ overrides: {}, user: null })
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			code: 'server_error',
			requestId: 'req_manifest',
		});

		await transport.init({ overrides: {}, user: null });
		expect(calls).toHaveLength(2);
	});

	test('a fetch that throws at once is tried again by the next init', async () => {
		let attempts = 0;
		const transport = createV1ManifestTransport({
			fetch: (() => {
				attempts += 1;
				if (attempts === 1) {
					throw new TypeError('offline');
				}
				return Promise.resolve(json(200, MANIFEST));
			}) as typeof globalThis.fetch,
			projectUrl: PROJECT_URL,
		});

		await expect(transport.init({ overrides: {}, user: null })).rejects.toThrow(
			'offline'
		);
		await transport.init({ overrides: {}, user: null });

		expect(attempts).toBe(2);
	});
});

describe('a manifest body that is not an object', () => {
	test('fails the init and is fetched again by the next one', async () => {
		let attempts = 0;
		const transport = createV1ManifestTransport({
			fetch: (() => {
				attempts += 1;
				return Promise.resolve(json(200, attempts === 1 ? null : MANIFEST));
			}) as typeof globalThis.fetch,
			projectUrl: PROJECT_URL,
		});

		await expect(transport.init({ overrides: {}, user: null })).rejects.toThrow(
			'without a manifest'
		);
		await transport.init({ overrides: {}, user: null });

		expect(attempts).toBe(2);
	});
});

describe('the IAB vendor list', () => {
	test('resolves a relative URL against the manifest URL', async () => {
		const urls: string[] = [];
		const transport = createV1ManifestTransport({
			fetch: stubFetch(() => json(200, {})).fetch,
			fetchGvl: ({ reference }) => {
				urls.push(reference.url);
				return Promise.resolve(null);
			},
			projectUrl: PROJECT_URL,
			snapshot: {
				...MANIFEST,
				cmpId: 28,
				iab: { enabled: true, gvl: { url: '/gvl/vendor-list.json' } },
				policyPacks: [
					createConsentManifestPolicyPack({
						id: 'iab',
						match: { fallback: true },
						model: 'iab',
						prompt: 'choice',
					}),
				],
			} as unknown as ConsentManifest,
		});

		await transport.init({ overrides: {}, user: null });

		expect(urls).toEqual([`${PROJECT_URL}/gvl/vendor-list.json`]);
	});
});

describe('saves in manifest mode', () => {
	test('assert the decision the manifest resolved', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);
		const transport = createV1ManifestTransport({
			fetch,
			projectUrl: PROJECT_URL,
			property: 'www.example.com',
			snapshot: MANIFEST,
		});

		await transport.init({ overrides: { country: 'DE' }, user: null });
		const result = await transport.save(
			savePayload({ policySnapshotToken: null })
		);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/consent/records`);
		expect(calls[0]?.body).toMatchObject({
			country: 'DE',
			language: 'en',
			policyId: 'eu',
			property: 'www.example.com',
			region: null,
		});
		expect(bodyAt(calls, 0).fingerprint).toEqual(expect.any(String));
		expect(result).toEqual({ ok: true, recordId: RECORD, subjectId: SUBJECT });
	});

	test('drop the journey no request carried', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);
		const transport = createV1ManifestTransport({
			fetch,
			projectUrl: PROJECT_URL,
			snapshot: MANIFEST,
		});

		await transport.init({ journey: JOURNEY, overrides: {}, user: null });
		await transport.save(
			savePayload({ journey: { id: JOURNEY.id, scope: 'page' } })
		);

		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/consent/records`);
	});
});

describe('POST /v1/consent/sessions', () => {
	test('a server caller reports the resolution with the visitor headers', async () => {
		const { calls, fetch } = stubFetch(
			() => new Response(null, { status: 202 })
		);
		let reported: Promise<void> | undefined;
		const transport = createV1ManifestTransport({
			fetch,
			projectUrl: PROJECT_URL,
			report: {
				adapter: '@inth/nextjs',
				headers: {
					cookie: 'session=1',
					'user-agent': 'Mozilla/5.0',
					'x-forwarded-for': '203.0.113.7',
				},
				source: 'render',
				waitUntil: (task) => {
					reported = task;
				},
			},
			snapshot: MANIFEST,
		});

		await transport.init({
			journey: JOURNEY,
			overrides: { country: 'DE' },
			user: null,
		});
		await reported;

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/consent/sessions`);
		expect(calls[0]?.init.method).toBe('POST');
		expect(calls[0]?.headers).toEqual({
			'content-type': 'application/json',
			'user-agent': 'Mozilla/5.0',
			'x-inth-client-ip': '203.0.113.7',
		});
		expect(calls[0]?.body).toMatchObject({
			adapter: '@inth/nextjs',
			country: 'DE',
			journey: {
				id: JOURNEY.id,
				prompt: 'due',
				scope: 'page',
				storedChoice: false,
			},
			resolution: 'matched',
			revision: 'rev-1',
			source: 'render',
		});
	});

	test.each([
		[
			'the x-inth-experiment header',
			{ 'x-inth-experiment': 'banner-copy=b' },
			'https://www.example.com/api/consent/init',
		],
		[
			'the experiment query parameter',
			{},
			'https://www.example.com/api/consent/init?experiment=banner-copy%3Db',
		],
	])('reads the experiment arm from %s', async (_label, headers, url) => {
		const { calls, fetch } = stubFetch(
			() => new Response(null, { status: 202 })
		);

		await reportV1ConsentSession({
			fetch,
			headers,
			init: REPORT_INIT,
			inputs: { country: 'DE', gpc: false, region: null },
			manifest: MANIFEST,
			projectUrl: PROJECT_URL,
			source: 'route',
			url,
		});

		expect(bodyAt(calls, 0).experiment).toEqual({
			arm: 'b',
			id: 'banner-copy',
		});
	});

	test('names the journey site property, in lowercase with no trailing dot', () => {
		const report = buildV1ConsentSessionReport({
			init: {
				location: { countryCode: null, regionCode: null },
				translations: { language: 'en' },
			} as never,
			journey: { ...JOURNEY, domain: 'WWW.Example.com.' },
			manifest: MANIFEST,
			source: 'route',
		});

		expect(report.journey).toEqual({
			id: JOURNEY.id,
			prompt: 'not-required',
			property: 'www.example.com',
			scope: 'page',
			storedChoice: false,
		});
	});

	test.each([
		['a HEAD request', { method: 'HEAD' }],
		['a prefetch', { headers: { 'sec-purpose': 'prefetch' } }],
	])(
		'%s reports nothing, and the save carries no journey',
		async (_label, report) => {
			const { calls, fetch } = stubFetch(() =>
				json(200, { recordId: RECORD, subjectId: SUBJECT })
			);
			const transport = createV1ManifestTransport({
				fetch,
				projectUrl: PROJECT_URL,
				report: { source: 'render', ...report },
				snapshot: MANIFEST,
			});

			await transport.init({ journey: JOURNEY, overrides: {}, user: null });
			await transport.save(
				savePayload({ journey: { id: JOURNEY.id, scope: 'page' } })
			);

			expect(calls.map((call) => call.url)).toEqual([
				`${PROJECT_URL}/v1/consent/records`,
			]);
		}
	);

	test('leaves off the tenant a 3.x manifest names', () => {
		const report = buildV1ConsentSessionReport({
			init: {
				location: { countryCode: null, regionCode: null },
				translations: { language: 'en' },
			} as never,
			manifest: { ...MANIFEST, tenantId: 'tenant_1' },
			source: 'route',
		});

		expect(report).not.toHaveProperty('tenantId');
	});

	test('a relative project URL reports nothing', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);
		const transport = createV1ManifestTransport({
			fetch,
			projectUrl: '/api/inth',
			report: { source: 'render' },
			snapshot: MANIFEST,
		});

		await transport.init({ journey: JOURNEY, overrides: {}, user: null });

		expect(calls).toEqual([]);
	});
});
