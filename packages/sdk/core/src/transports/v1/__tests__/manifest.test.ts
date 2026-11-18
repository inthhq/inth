/**
 * Manifest mode on `/v1`: the manifest fetch, local resolution, saves with
 * the decision assertion, and the server-side session report.
 */
import { createConsentManifestPolicyPack } from '@inth/sdk-schema/types';
import type { ConsentManifest } from '@inth/sdk-schema/types';
import { describe, expect, test } from 'vitest';

import { InthApiError } from '../error';
import { createV1ManifestTransport } from '../manifest';
import { buildV1ConsentSessionReport } from '../session-report';
import {
	bodyAt,
	json,
	PROJECT_URL,
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
		expect(error).toBeInstanceOf(InthApiError);
		expect(error).toMatchObject({
			code: 'server_error',
			requestId: 'req_manifest',
		});

		await transport.init({ overrides: {}, user: null });
		expect(calls).toHaveLength(2);
	});
});

describe('saves in manifest mode', () => {
	test('assert the decision the manifest resolved', async () => {
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));
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
		expect(result).toEqual({ ok: true, subjectId: SUBJECT });
	});

	test('drop the journey no request carried', async () => {
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));
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
	test('a server caller reports the resolution, with the site as property', async () => {
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
			'x-c15t-client-ip': '203.0.113.7',
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

	test('names the journey site property, in lowercase', () => {
		const report = buildV1ConsentSessionReport({
			init: {
				location: { countryCode: null, regionCode: null },
				translations: { language: 'en' },
			} as never,
			journey: { ...JOURNEY, domain: 'WWW.Example.com' },
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

	test('a relative project URL reports nothing', async () => {
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));
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
