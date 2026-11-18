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

const CURRENT = {
	document: {
		effectiveDate: '2026-11-18T00:00:00.000Z',
		hash: HASH,
		requiresAcceptance: true,
		type: 'terms_us',
		version: '2026-11-18',
	},
	proofToken: 'proof-terms',
	proofTokenExpiresAt: '2026-11-19T00:00:00.000Z',
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

describe('getCurrent: GET /v1/documents/:type/current', () => {
	test('reads the version in force and its proof token, without the secret key', async () => {
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
		const { calls, fetch } = stubFetch(() => json(200, RECORDED));
		const documents = createDocumentsClient({ fetch, projectUrl: PROJECT_URL });

		const result = await documents.recordAcceptances({
			acceptances: [
				{ proofToken: 'proof-terms', type: 'terms_us' },
				{ proofToken: 'proof-privacy', type: 'privacy_policy' },
			],
			acceptedAt: 1_763_467_200_000,
			idempotencyKey: KEY,
			property: 'WWW.Example.com',
			subjectId: SUBJECT,
		});

		expect(result).toEqual(RECORDED);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/documents/acceptances`);
		expect(calls[0]?.init.method).toBe('POST');
		expect(calls[0]?.headers).toEqual({
			accept: 'application/json',
			'content-type': 'application/json',
		});
		expect(calls[0]?.body).toEqual({
			acceptances: [
				{ proofToken: 'proof-terms', type: 'terms_us' },
				{ proofToken: 'proof-privacy', type: 'privacy_policy' },
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
			acceptances: [{ proofToken: 'proof-terms', type: 'terms_us' }],
			externalId: 'user_123',
			idempotencyKey: KEY,
			identityProvider: 'clerk',
			identityToken: 'token',
			property: 'WWW.Example.com',
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
			acceptances: [{ proofToken: 'proof-terms', type: 'terms_us' }],
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

	test('an expired proof token throws its code', async () => {
		const { fetch } = stubFetch(() =>
			v1Error(409, 'document_proof_expired', 'req_accept')
		);
		const documents = createDocumentsClient({ fetch, projectUrl: PROJECT_URL });

		const error = await documents
			.recordAcceptances({
				acceptances: [{ proofToken: 'old', type: 'terms_us' }],
				idempotencyKey: KEY,
				subjectId: SUBJECT,
			})
			.catch((caught: unknown) => caught);

		expect(error).toMatchObject({
			code: 'document_proof_expired',
			requestId: 'req_accept',
		});
	});

	test.each([
		[
			'no acceptance',
			{ acceptances: [], idempotencyKey: KEY, subjectId: SUBJECT },
		],
		[
			'no key',
			{
				acceptances: [{ proofToken: 'p', type: 'terms_us' }],
				idempotencyKey: '',
				subjectId: SUBJECT,
			},
		],
		[
			'no subject or person',
			{
				acceptances: [{ proofToken: 'p', type: 'terms_us' }],
				idempotencyKey: KEY,
			},
		],
		[
			'a malformed type',
			{
				acceptances: [{ proofToken: 'p', type: 'Terms' }],
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
