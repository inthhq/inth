/**
 * `POST /v1/consent/records` and `POST /v1/subjects/:id/link` against a
 * stubbed `fetch`: the exact request, and how each answer is read.
 */
import { describe, expect, test } from 'vitest';

import { isUuidV7 } from '../../../libs/subject-uuid';
import {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../save-rejection';
import { InthApiError, isInthApiError } from '../error';
import { createV1RecordTransport } from '../records';
import { InthConsentSaveRejectedError } from '../save-rejected';
import {
	ACTION_AT,
	bodyAt,
	json,
	KEY,
	LEGACY_SUBJECT,
	PROJECT_URL,
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
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));

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
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));

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

	test('carries the journey as query parameters', async () => {
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));

		await transportWith(fetch).save(
			savePayload({
				journey: { id: '3b241101-e2bb-4255-8caf-4136c566a962', scope: 'tab' },
			})
		);

		const url = new URL(calls[0]?.url ?? '');
		expect(`${url.origin}${url.pathname}`).toBe(
			`${PROJECT_URL}/v1/consent/records`
		);
		expect(url.searchParams.get('journey')).toBe(
			'3b241101-e2bb-4255-8caf-4136c566a962'
		);
		expect(url.searchParams.get('journeyScope')).toBe('tab');
	});

	test('a vendor-only save confirms no category and still sends the answer', async () => {
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));

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

	test('sends the same key every time the same payload is sent', async () => {
		const { calls, fetch } = stubFetch(
			() => json(503, {}),
			() => json(200, { subjectId: SUBJECT })
		);
		const transport = transportWith(fetch);
		const payload = savePayload();

		await transport.save(payload).catch(() => undefined);
		await transport.save(payload);

		expect(
			calls.map(
				(call) => (call.body as { idempotencyKey: string }).idempotencyKey
			)
		).toEqual([KEY, KEY]);
	});

	test('a payload without a key gets one', async () => {
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));

		await transportWith(fetch).save(savePayload({ idempotencyKey: undefined }));

		expect(isUuidV7(String(bodyAt(calls, 0).idempotencyKey))).toBe(true);
	});

	test('lowercases the property', async () => {
		const { calls, fetch } = stubFetch(() => json(200, { subjectId: SUBJECT }));

		await transportWith(fetch, 'WWW.Example.COM').save(savePayload());

		expect(bodyAt(calls, 0).property).toBe('www.example.com');
	});
});

describe('save: the answer', () => {
	test('returns the canonical subject ID for a stored sub_ ID', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, {
				link: { reason: 'unverified', stored: false },
				subjectId: SUBJECT,
			})
		);

		const result = await transportWith(fetch).save(
			savePayload({
				subject: { subjectId: LEGACY_SUBJECT },
				subjectId: LEGACY_SUBJECT,
			})
		);

		expect(bodyAt(calls, 0).subjectId).toBe(LEGACY_SUBJECT);
		expect(result).toEqual({
			link: { reason: 'unverified', stored: false },
			ok: true,
			subjectId: SUBJECT,
		});
	});

	test('ignores a subject ID that is not a canonical UUID', async () => {
		const { fetch } = stubFetch(() => json(200, { subjectId: LEGACY_SUBJECT }));

		expect(await transportWith(fetch).save(savePayload())).toEqual({
			ok: true,
		});
	});

	test.each([
		[409, 'policy_snapshot_expired'],
		[409, 'policy_snapshot_invalid'],
		[409, 'policy_snapshot_required'],
		[409, 'conflict'],
		[402, 'payment_required'],
		[413, 'payload_too_large'],
	])(
		'a %i %s is refused for good, with its request ID',
		async (status, code) => {
			const { fetch } = stubFetch(() => v1Error(status, code, 'req_save'));

			const error = await transportWith(fetch)
				.save(savePayload())
				.catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(InthConsentSaveRejectedError);
			expect(isConsentSaveRejection(error)).toBe(true);
			expect(isInthApiError(error)).toBe(true);
			expect(error).toMatchObject({ code, requestId: 'req_save', status });
		}
	);

	test('a subject_conflict is the refusal the kernel recovers from', async () => {
		const { fetch } = stubFetch(() => v1Error(409, 'subject_conflict'));

		const error = await transportWith(fetch)
			.save(savePayload())
			.catch((caught: unknown) => caught);

		expect(isSubjectConflict(error)).toBe(true);
	});

	test.each([
		[400, 'invalid_request'],
		[429, 'rate_limited'],
		[500, 'server_error'],
		[502, 'bad_gateway'],
	])('a %i %s stays retryable', async (status, code) => {
		const { fetch } = stubFetch(() => v1Error(status, code));

		const error = await transportWith(fetch)
			.save(savePayload())
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(InthApiError);
		expect(isConsentSaveRejection(error)).toBe(false);
		expect(error).toMatchObject({ code, requestId: 'req_123', status });
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

	test('a refused link throws the code and request ID', async () => {
		const { fetch } = stubFetch(() =>
			v1Error(401, 'identity_token_invalid', 'req_link')
		);

		const error = await transportWith(fetch)
			.identify({ ...user, identityToken: 'stale' }, SUBJECT)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(InthApiError);
		expect(error).toMatchObject({
			code: 'identity_token_invalid',
			requestId: 'req_link',
			status: 401,
		});
	});
});
