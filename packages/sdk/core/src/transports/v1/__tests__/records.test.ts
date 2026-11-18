/**
 * `POST /v1/consent/records` and `POST /v1/subjects/:id/link` against a
 * stubbed `fetch`: the exact request, and how each answer is read.
 */
import {
	v1ConsentRecordInputSchema,
	v1ConsentRecordQuerySchema,
} from '@inth/sdk-schema/v1';
import { describe, expect, test } from 'vitest';

import { isUuidV7 } from '../../../libs/subject-uuid';
import {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../save-rejection';
import { ApiError, isApiError } from '../error';
import { createV1RecordTransport } from '../records';
import { ApiSaveRejectedError } from '../save-rejected';
import {
	ACTION_AT,
	bodyAt,
	json,
	KEY,
	LEGACY_SUBJECT,
	PROJECT_URL,
	RECORD,
	savePayload,
	stubFetch,
	SUBJECT,
	v1Error,
} from './fixtures';

const transportWith = (fetch: typeof globalThis.fetch, property?: string) =>
	createV1RecordTransport({
		fetch,
		projectUrl: `${PROJECT_URL}/`,
		property: property ?? 'www.example.com',
	});

describe('save: POST /v1/consent/records', () => {
	test('sends the complete answer, the confirmed categories and the key', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch).save(savePayload());

		expect(calls).toHaveLength(1);
		const [call] = calls;
		expect(call?.url).toBe(`${PROJECT_URL}/v1/consent/records`);
		expect(call?.init.method).toBe('POST');
		expect(call?.headers).toEqual({
			accept: 'application/json',
			'content-type': 'application/json',
		});
		expect(call?.body).toEqual({
			answer: {
				categories: {
					marketing: {
						basis: { fingerprint: 'fp-choice', kind: 'choice-v1' },
						confirmedAt: 1_760_000_000_000,
						value: false,
					},
					measurement: {
						basis: { fingerprint: 'fp-choice', kind: 'choice-v1' },
						confirmedAt: ACTION_AT,
						value: true,
					},
				},
			},
			confirmed: ['measurement'],
			consentAction: 'custom',
			givenAt: ACTION_AT,
			idempotencyKey: KEY,
			model: 'opt-in',
			policySnapshotToken: 'snapshot-token',
			property: 'www.example.com',
			subjectId: SUBJECT,
			uiSource: 'dialog',
		});
	});

	test('sends the identity fields', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch).save(
			savePayload({
				user: {
					externalId: 'user_123',
					identityProvider: 'clerk',
					identityToken: 'token',
				},
			})
		);

		expect(bodyAt(calls, 0)).toMatchObject({
			externalId: 'user_123',
			identityProvider: 'clerk',
			identityToken: 'token',
		});
	});

	test('builds a body the records schema accepts', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch).save(
			savePayload({
				choice: {
					categories: {
						measurement: {
							basis: { kind: 'legacy-v2', materialFingerprint: 'm' },
							confirmedAt: ACTION_AT,
							value: true,
						},
					},
					version: 3,
				},
				subject: { subjectId: LEGACY_SUBJECT },
				subjectId: LEGACY_SUBJECT,
				user: {
					externalId: 'user_123',
					identityProvider: 'clerk',
					identityToken: 'token',
				},
				vendorChoice: {
					confirmedAt: ACTION_AT,
					grants: { 'vendor-a': true },
					version: 1,
				},
			})
		);

		expect(
			v1ConsentRecordInputSchema['~standard'].validate(bodyAt(calls, 0))
		).not.toHaveProperty('issues');
	});

	test('carries the journey as query parameters', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch).save(
			savePayload({
				journey: { id: '3b241101-e2bb-4255-8caf-4136c566a962', scope: 'tab' },
			})
		);

		const url = new URL(calls[0]?.url ?? '');
		expect(`${url.origin}${url.pathname}`).toBe(
			`${PROJECT_URL}/v1/consent/records`
		);
		expect(
			v1ConsentRecordQuerySchema['~standard'].validate(
				Object.fromEntries(url.searchParams)
			)
		).toMatchObject({
			value: {
				journey: '3b241101-e2bb-4255-8caf-4136c566a962',
				journeyScope: 'tab',
			},
		});
	});

	test('a vendor-only save confirms no category and still sends the answer', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch).save(
			savePayload({
				confirmed: { actionAt: ACTION_AT, categories: {} },
				vendorChoice: {
					confirmedAt: ACTION_AT,
					grants: { 'vendor-a': true },
					version: 1,
				},
			})
		);

		const body = calls[0]?.body as Record<string, unknown>;
		expect(body.confirmed).toEqual([]);
		expect(
			Object.keys((body.answer as { categories: object }).categories).sort()
		).toEqual(['marketing', 'measurement']);
		expect(body.vendorChoice).toEqual({
			confirmedAt: ACTION_AT,
			grants: { 'vendor-a': true },
			version: 1,
		});
	});

	test('a payload without a key gets one', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch).save(savePayload({ idempotencyKey: undefined }));

		expect(isUuidV7(String(bodyAt(calls, 0).idempotencyKey))).toBe(true);
	});

	test.each([
		['www.example.com.', 'www.example.com'],
		['www.example.com..', 'www.example.com.'],
	])('sends %s as the property %s', async (option, property) => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch, option).save(savePayload());

		expect(bodyAt(calls, 0).property).toBe(property);
	});

	test('lowercases the property', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch, 'WWW.Example.COM').save(savePayload());

		expect(bodyAt(calls, 0).property).toBe('www.example.com');
	});
});

describe('save: the answer', () => {
	test('returns the canonical subject ID for a stored sub_ ID', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		const result = await transportWith(fetch).save(
			savePayload({
				subject: { subjectId: LEGACY_SUBJECT },
				subjectId: LEGACY_SUBJECT,
			})
		);

		expect(bodyAt(calls, 0).subjectId).toBe(LEGACY_SUBJECT);
		expect(result).toEqual({ ok: true, recordId: RECORD, subjectId: SUBJECT });
	});

	test.each([
		[
			{ stored: true, verifiedBy: 'identity_token' },
			{ externalId: 'user_123', identityToken: 'token' },
		],
		[{ reason: 'unverified', stored: false }, { externalId: 'user_123' }],
		[
			{ reason: 'invalid_token', stored: false },
			{ externalId: 'user_123', identityToken: 'stale' },
		],
	])(
		'a save with an externalId succeeds with the link %o',
		async (link, user) => {
			const { fetch } = stubFetch(() =>
				json(200, { link, recordId: RECORD, subjectId: SUBJECT })
			);

			const result = await transportWith(fetch).save(savePayload({ user }));

			expect(result).toEqual({
				link,
				ok: true,
				recordId: RECORD,
				subjectId: SUBJECT,
			});
		}
	);

	test.each([
		[
			'a sub_ subject ID',
			() => json(200, { recordId: RECORD, subjectId: LEGACY_SUBJECT }),
		],
		['no record ID', () => json(200, { subjectId: SUBJECT })],
		['a page', () => new Response('<html>ok</html>', { status: 200 })],
	])('retries an answer with %s', async (_label, answer) => {
		const { fetch } = stubFetch(answer);

		const error = await transportWith(fetch)
			.save(savePayload())
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(Error);
		expect(isConsentSaveRejection(error)).toBe(false);
	});

	test.each([
		[409, 'policy_snapshot_expired'],
		[409, 'policy_snapshot_invalid'],
		[409, 'policy_snapshot_required'],
		[409, 'conflict'],
		[413, 'payload_too_large'],
	])(
		'a %i %s is refused for good, with its request ID',
		async (status, code) => {
			const { fetch } = stubFetch(() => v1Error(status, code, 'req_save'));

			const error = await transportWith(fetch)
				.save(savePayload())
				.catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(ApiSaveRejectedError);
			expect(isConsentSaveRejection(error)).toBe(true);
			expect(isApiError(error)).toBe(true);
			expect(error).toMatchObject({ code, requestId: 'req_save', status });
		}
	);

	test('retries a 409 whose body names no code', async () => {
		const { fetch } = stubFetch(
			() => new Response('<html>Conflict</html>', { status: 409 })
		);

		const error = await transportWith(fetch)
			.save(savePayload())
			.catch((caught: unknown) => caught);

		expect(error).toMatchObject({ code: 'conflict', status: 409 });
		expect(isConsentSaveRejection(error)).toBe(false);
	});

	test('a subject_conflict is the refusal the kernel recovers from', async () => {
		const { fetch } = stubFetch(() => v1Error(409, 'subject_conflict'));

		const error = await transportWith(fetch)
			.save(savePayload())
			.catch((caught: unknown) => caught);

		expect(isSubjectConflict(error)).toBe(true);
	});

	test.each([
		[400, 'invalid_request'],
		// Never the identity token, which only leaves the link off.
		[401, 'unauthorized'],
		[429, 'rate_limited'],
		[500, 'server_error'],
		[502, 'bad_gateway'],
	])('a %i %s stays retryable', async (status, code) => {
		const { fetch } = stubFetch(() => v1Error(status, code));

		const error = await transportWith(fetch)
			.save(savePayload())
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ApiError);
		expect(isConsentSaveRejection(error)).toBe(false);
		expect(error).toMatchObject({ code, requestId: 'req_123', status });
	});

	test('reports the canonical ID a save answers for a stored sub_ ID', async () => {
		const { fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);
		const seen: [string, string][] = [];
		const transport = createV1RecordTransport({
			fetch,
			onSubjectId: (subjectId, previous) => seen.push([subjectId, previous]),
			projectUrl: PROJECT_URL,
		});

		await transport.save(
			savePayload({
				subject: { subjectId: LEGACY_SUBJECT },
				subjectId: LEGACY_SUBJECT,
			})
		);

		expect(seen).toEqual([[SUBJECT, LEGACY_SUBJECT]]);
	});
});

describe('identify: POST /v1/subjects/:id/link', () => {
	const user = { externalId: 'user_123', identityProvider: 'clerk' };

	test('sends nothing without an identity token', async () => {
		const { calls, fetch } = stubFetch(() => json(200, {}));

		await transportWith(fetch).identify(user, SUBJECT);

		expect(calls).toEqual([]);
	});

	test('sends nothing before a subject exists', async () => {
		const { calls, fetch } = stubFetch(() => json(200, {}));

		await transportWith(fetch).identify(
			{ ...user, identityToken: 'token' },
			null
		);

		expect(calls).toEqual([]);
	});

	test('links the subject with the token', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, {
				externalId: 'user_123',
				subjectId: SUBJECT,
				verifiedBy: 'identity_token',
			})
		);

		await transportWith(fetch).identify(
			{ ...user, identityToken: 'token' },
			SUBJECT
		);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/subjects/${SUBJECT}/link`);
		expect(calls[0]?.init.method).toBe('POST');
		expect(calls[0]?.headers).toEqual({
			accept: 'application/json',
			'content-type': 'application/json',
		});
		expect(calls[0]?.body).toEqual({
			externalId: 'user_123',
			identityProvider: 'clerk',
			identityToken: 'token',
		});
	});

	test('reports the canonical ID for a stored sub_ ID', async () => {
		const { fetch } = stubFetch(() =>
			json(200, {
				externalId: 'user_123',
				subjectId: SUBJECT,
				verifiedBy: 'identity_token',
			})
		);
		const seen: [string, string][] = [];
		const transport = createV1RecordTransport({
			fetch,
			onSubjectId: (subjectId, previous) => seen.push([subjectId, previous]),
			projectUrl: PROJECT_URL,
		});

		await transport.identify(
			{ ...user, identityToken: 'token' },
			LEGACY_SUBJECT
		);

		expect(seen).toEqual([[SUBJECT, LEGACY_SUBJECT]]);
	});

	test('rejects a link answer without a canonical subject ID', async () => {
		const { fetch } = stubFetch(
			() => new Response('<html>ok</html>', { status: 200 })
		);

		await expect(
			transportWith(fetch).identify(
				{ ...user, identityToken: 'token' },
				SUBJECT
			)
		).rejects.toThrow(/without a canonical subject ID/u);
	});

	test('a refused link throws the code and request ID', async () => {
		const { fetch } = stubFetch(() =>
			v1Error(401, 'identity_token_invalid', 'req_link')
		);

		const error = await transportWith(fetch)
			.identify({ ...user, identityToken: 'stale' }, SUBJECT)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(ApiError);
		expect(error).toMatchObject({
			code: 'identity_token_invalid',
			requestId: 'req_link',
			status: 401,
		});
	});
});
