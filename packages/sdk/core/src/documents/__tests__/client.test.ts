/**
 * The documents client against a stubbed `fetch`.
 */
import { v1DocumentAcceptancesInputSchema } from '@inth/sdk-schema/v1';
import { describe, expect, test } from 'vitest';

import {
	bodyAt,
	json,
	KEY,
	PROJECT_URL,
	stubFetch,
	SUBJECT,
	v1Error,
} from '../../transports/v1/__tests__/fixtures';
import { ApiError, createDocumentsClient } from '../index';

const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const PRIVACY_HASH =
	'sha256:60303ae22b998861bce3b28f33eec1be758a213c86c93c076dbe9f558c11c752';

const CURRENT = {
	document: {
		effectiveDate: '2026-11-18T00:00:00.000Z',
		hash: HASH,
		id: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
		isCurrent: true,
		requiresAcceptance: true,
		type: 'terms_us',
		version: '2026-11-18',
	},
};

const RECORDED = {
	acceptances: [
		{
			acceptedAt: 1_763_467_200_000,
			hash: HASH,
			type: 'terms_us',
			version: '2026-11-18',
		},
	],
	subjectId: SUBJECT,
};

/** The receipt for a batch of terms and privacy policy. */
const RECORDED_BOTH = {
	...RECORDED,
	acceptances: [
		...RECORDED.acceptances,
		{
			acceptedAt: 1_763_467_200_000,
			hash: PRIVACY_HASH,
			type: 'privacy_policy',
			version: '2026-11-01',
		},
	],
};

describe('getCurrent: GET /v1/documents/:type/current', () => {
	test('reads the release in force, without the secret key', async () => {
		const { calls, fetch } = stubFetch(() => json(200, CURRENT));
		const documents = createDocumentsClient({
			fetch,
			projectUrl: `${PROJECT_URL}/`,
			secretKey: 'sk_test',
		});

		const current = await documents.getCurrent('terms_us');

		expect(current).toEqual(CURRENT);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/documents/terms_us/current`);
		expect(calls[0]?.init.method).toBe('GET');
		expect(calls[0]?.headers).toEqual({ accept: 'application/json' });
	});

	test.each([
		['a page', () => new Response('<html>ok</html>', { status: 200 })],
		[
			'a document without effectiveDate',
			() =>
				json(200, {
					...CURRENT,
					document: { ...CURRENT.document, effectiveDate: undefined },
				}),
		],
		[
			'a document whose id is not a UUID',
			() =>
				json(200, {
					document: { ...CURRENT.document, id: 'not-a-uuid' },
				}),
		],
		[
			'a document whose hash is not sha256 hex',
			() =>
				json(200, {
					document: { ...CURRENT.document, hash: 'sha256:abc' },
				}),
		],
		[
			'a document without isCurrent',
			() =>
				json(200, {
					document: { ...CURRENT.document, isCurrent: undefined },
				}),
		],
	])('refuses an answer that is %s', async (_label, answer) => {
		const { fetch } = stubFetch(answer);
		const documents = createDocumentsClient({ fetch, projectUrl: PROJECT_URL });

		await expect(documents.getCurrent('terms_us')).rejects.toThrow(
			/answer is unreadable/u
		);
	});

	test('a type with no current version throws not_found', async () => {
		const { fetch } = stubFetch(() => v1Error(404, 'not_found', 'req_doc'));
		const documents = createDocumentsClient({ fetch, projectUrl: PROJECT_URL });

		const error = await documents
			.getCurrent('terms_eu')
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			code: 'not_found',
			requestId: 'req_doc',
			status: 404,
		});
	});

	test('refuses a malformed type without a request', async () => {
		const { calls, fetch } = stubFetch(() => json(200, CURRENT));
		const documents = createDocumentsClient({ fetch, projectUrl: PROJECT_URL });

		await expect(documents.getCurrent('../subjects')).rejects.toThrow(
			TypeError
		);
		expect(calls).toEqual([]);
	});
});

describe('recordAcceptances: POST /v1/documents/acceptances', () => {
	test('sends the acceptances, the subject and the key', async () => {
		const { calls, fetch } = stubFetch(() => json(200, RECORDED_BOTH));
		const documents = createDocumentsClient({ fetch, projectUrl: PROJECT_URL });

		const result = await documents.recordAcceptances({
			acceptances: [
				{ hash: HASH, type: 'terms_us' },
				{ hash: PRIVACY_HASH, type: 'privacy_policy' },
			],
			acceptedAt: 1_763_467_200_000,
			idempotencyKey: KEY,
			property: 'WWW.Example.com',
			subjectId: SUBJECT,
		});

		expect(result).toEqual(RECORDED_BOTH);
		expect(result.acceptances.map(({ type }) => type)).toEqual([
			'terms_us',
			'privacy_policy',
		]);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/documents/acceptances`);
		expect(calls[0]?.init.method).toBe('POST');
		expect(calls[0]?.headers).toEqual({
			accept: 'application/json',
			'content-type': 'application/json',
		});
		expect(calls[0]?.body).toEqual({
			acceptances: [
				{ hash: HASH, type: 'terms_us' },
				{ hash: PRIVACY_HASH, type: 'privacy_policy' },
			],
			acceptedAt: 1_763_467_200_000,
			idempotencyKey: KEY,
			property: 'www.example.com',
			subjectId: SUBJECT,
		});
	});

	test('builds a body the acceptances schema accepts, dated now by default', async () => {
		const { calls, fetch } = stubFetch(() => json(200, RECORDED));
		const documents = createDocumentsClient({ fetch, projectUrl: PROJECT_URL });

		await documents.recordAcceptances({
			acceptances: [{ hash: HASH, type: 'terms_us' }],
			externalId: 'user_123',
			idempotencyKey: KEY,
			identityProvider: 'clerk',
			identityToken: 'token',
			property: 'WWW.Example.com.',
			subjectId: 'sub_2VZxR7YmNpKq3WfLs8TgHd',
		});

		expect(
			v1DocumentAcceptancesInputSchema['~standard'].validate(bodyAt(calls, 0))
		).not.toHaveProperty('issues');
		expect(bodyAt(calls, 0).acceptedAt).toEqual(expect.any(Number));
	});

	test('a server records for a person with its secret key and the visitor context', async () => {
		const { calls, fetch } = stubFetch(() => json(200, RECORDED));
		const documents = createDocumentsClient({
			fetch,
			projectUrl: PROJECT_URL,
			secretKey: 'sk_test',
		});

		await documents.recordAcceptances({
			acceptances: [{ hash: HASH, type: 'terms_us' }],
			context: { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0' },
			externalId: 'user_123',
			idempotencyKey: KEY,
		});

		expect(calls[0]?.headers.authorization).toBe('Bearer sk_test');
		expect(calls[0]?.body).toMatchObject({
			context: { ipAddress: '203.0.113.7', userAgent: 'Mozilla/5.0' },
			externalId: 'user_123',
		});
		expect(bodyAt(calls, 0)).not.toHaveProperty('subjectId');
	});

	test('a release the project never published throws document_unknown', async () => {
		const { fetch } = stubFetch(() =>
			v1Error(409, 'document_unknown', 'req_accept')
		);
		const documents = createDocumentsClient({ fetch, projectUrl: PROJECT_URL });

		const error = await documents
			.recordAcceptances({
				acceptances: [{ hash: PRIVACY_HASH, type: 'terms_us' }],
				idempotencyKey: KEY,
				subjectId: SUBJECT,
			})
			.catch((caught: unknown) => caught);

		expect(error).toMatchObject({
			code: 'document_unknown',
			requestId: 'req_accept',
		});
	});

	test.each([
		[
			'no acceptance',
			{ acceptances: [], idempotencyKey: KEY, subjectId: SUBJECT },
		],
		[
			'more than 20 acceptances',
			{
				acceptances: Array.from({ length: 21 }, () => ({
					hash: HASH,
					type: 'terms_us',
				})),
				idempotencyKey: KEY,
				subjectId: SUBJECT,
			},
		],
		[
			'no key',
			{
				acceptances: [{ hash: HASH, type: 'terms_us' }],
				idempotencyKey: '',
				subjectId: SUBJECT,
			},
		],
		[
			'an uppercase key',
			{
				acceptances: [{ hash: HASH, type: 'terms_us' }],
				idempotencyKey: KEY.toUpperCase(),
				subjectId: SUBJECT,
			},
		],
		[
			'no subject or person',
			{
				acceptances: [{ hash: HASH, type: 'terms_us' }],
				idempotencyKey: KEY,
			},
		],
		[
			'a property that is not a host name',
			{
				acceptances: [{ hash: HASH, type: 'terms_us' }],
				idempotencyKey: KEY,
				property: 'https://example.com',
				subjectId: SUBJECT,
			},
		],
		[
			'a hash that is not sha256 hex',
			{
				acceptances: [
					{
						hash: `sha256:${HASH.slice(7).toUpperCase()}`,
						type: 'terms_us',
					},
				],
				idempotencyKey: KEY,
				subjectId: SUBJECT,
			},
		],
		[
			'a malformed type',
			{
				acceptances: [{ hash: HASH, type: 'Terms' }],
				idempotencyKey: KEY,
				subjectId: SUBJECT,
			},
		],
		[
			'a hash that is a list holding a valid hash',
			{
				acceptances: [{ hash: [HASH] as unknown as string, type: 'terms_us' }],
				idempotencyKey: KEY,
				subjectId: SUBJECT,
			},
		],
		[
			'a type that is a list holding a valid type',
			{
				acceptances: [{ hash: HASH, type: ['terms_us'] as unknown as string }],
				idempotencyKey: KEY,
				subjectId: SUBJECT,
			},
		],
	])('refuses %s without a request', async (_label, input) => {
		const { calls, fetch } = stubFetch(() => json(200, RECORDED));
		const documents = createDocumentsClient({ fetch, projectUrl: PROJECT_URL });

		await expect(documents.recordAcceptances(input)).rejects.toThrow(TypeError);
		expect(calls).toEqual([]);
	});
});
