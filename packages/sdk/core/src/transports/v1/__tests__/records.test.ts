/**
 * `POST /v1/consent/records` and `POST /v1/subjects/:id/link` against a
 * stubbed `fetch`: the exact request, and how each answer is read.
 */
import {
	v1ConsentOptOutInputSchema,
	v1ConsentOptOutLiftInputSchema,
	v1ConsentRecordInputSchema,
	v1ConsentRecordQuerySchema,
} from '@inth/sdk-schema/v1';
import { describe, expect, test, vi } from 'vitest';

import {
	isConsentSaveRejection,
	isSubjectConflict,
} from '../../save-rejection';
import { InthApiError, isInthApiError } from '../error';
import {
	buildV1ConsentOptOutBody,
	buildV1ConsentOptOutLiftBody,
} from '../opt-outs-body';
import { createV1RecordTransport } from '../records';
import { InthApiSaveRejectedError } from '../save-rejected';
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
	test('refuses a save without an idempotency key, and sends nothing', async () => {
		const { calls, fetch } = stubFetch(() => json(200, {}));

		await expect(
			transportWith(fetch).save(savePayload({ idempotencyKey: undefined }))
		).rejects.toThrow(/createIdempotencyKey\(\)/u);
		expect(calls).toHaveLength(0);
	});

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

	test('without a decision source, a save without a token asserts its own decision inputs', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch).save(
			savePayload({
				decisionInputs: {
					country: 'DE',
					fingerprint: 'fp',
					gpc: false,
					language: 'en',
					policyId: 'gdpr',
					region: null,
				},
				policySnapshotToken: null,
			})
		);

		expect(bodyAt(calls, 0)).toMatchObject({
			country: 'DE',
			fingerprint: 'fp',
			policyId: 'gdpr',
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

	test('sends the property without a trailing dot', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);

		await transportWith(fetch, 'www.example.com.').save(savePayload());

		expect(bodyAt(calls, 0).property).toBe('www.example.com');
	});

	test('names an IPv6 page localhost', async () => {
		vi.stubGlobal('window', { location: { hostname: '[::1]' } });
		try {
			const { calls, fetch } = stubFetch(() =>
				json(200, { recordId: RECORD, subjectId: SUBJECT })
			);

			await createV1RecordTransport({ fetch, projectUrl: PROJECT_URL }).save(
				savePayload()
			);

			expect(bodyAt(calls, 0).property).toBe('localhost');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	test.each(['www.example.com..', 'https://example.com', '[::1]'])(
		'refuses the property option %s',
		(option) => {
			const { fetch } = stubFetch(() => json(200, {}));

			expect(() => transportWith(fetch, option)).toThrow(TypeError);
		}
	);

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

	test('reads a record ID in uppercase', async () => {
		const { fetch } = stubFetch(() =>
			json(200, { recordId: RECORD.toUpperCase(), subjectId: SUBJECT })
		);

		const result = await transportWith(fetch).save(savePayload());

		expect(result).toEqual({
			ok: true,
			recordId: RECORD.toUpperCase(),
			subjectId: SUBJECT,
		});
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
		[
			{ reason: 'refused', stored: false },
			{ externalId: 'erased_user', identityToken: 'token' },
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
		[
			'a record ID that is not a UUID',
			() => json(200, { recordId: 'unknown', subjectId: SUBJECT }),
		],
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
		[400, 'invalid_request'],
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

			expect(error).toBeInstanceOf(InthApiSaveRejectedError);
			expect(isConsentSaveRejection(error)).toBe(true);
			expect(isInthApiError(error)).toBe(true);
			expect(error).toMatchObject({ code, requestId: 'req_save', status });
		}
	);

	test.each([
		[400, 'invalid_request'],
		[409, 'conflict'],
	])('retries a %i whose body names no code', async (status, code) => {
		const { fetch } = stubFetch(
			() => new Response('<html>Refused</html>', { status })
		);

		const error = await transportWith(fetch)
			.save(savePayload())
			.catch((caught: unknown) => caught);

		expect(error).toMatchObject({ code, status });
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

	test('answers the canonical ID for a stored sub_ ID', async () => {
		const { fetch } = stubFetch(() =>
			json(200, {
				externalId: 'user_123',
				subjectId: SUBJECT,
				verifiedBy: 'identity_token',
			})
		);

		await expect(
			transportWith(fetch).identify(
				{ ...user, identityToken: 'token' },
				LEGACY_SUBJECT
			)
		).resolves.toEqual({ subjectId: SUBJECT });
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

		expect(error).toBeInstanceOf(InthApiError);
		expect(error).toMatchObject({
			code: 'identity_token_invalid',
			requestId: 'req_link',
			status: 401,
		});
	});

	test('reads a valid optOut from a link answer and ignores an invalid one', async () => {
		const validOptOut = {
			heldBy: 'person' as const,
			method: 'api' as const,
			recordedAt: ACTION_AT + 1000,
			rights: ['sale', 'share'] as const,
		};
		const { fetch: fetchValid } = stubFetch(() =>
			json(200, {
				externalId: 'user_123',
				optOut: validOptOut,
				subjectId: SUBJECT,
				verifiedBy: 'identity_token',
			})
		);
		await expect(
			transportWith(fetchValid).identify(
				{ ...user, identityToken: 'token' },
				SUBJECT
			)
		).resolves.toEqual({ optOut: validOptOut, subjectId: SUBJECT });

		const { fetch: fetchInvalid } = stubFetch(() =>
			json(200, {
				externalId: 'user_123',
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: -1,
					rights: [],
				},
				subjectId: SUBJECT,
				verifiedBy: 'identity_token',
			})
		);
		await expect(
			transportWith(fetchInvalid).identify(
				{ ...user, identityToken: 'token' },
				SUBJECT
			)
		).resolves.toEqual({ subjectId: SUBJECT });
	});
});

describe('save: optional optOut in answer', () => {
	test('reads a valid optOut from POST /v1/consent/records and treats an invalid one as no information', async () => {
		const validOptOut = {
			heldBy: 'both' as const,
			method: 'button' as const,
			recordedAt: ACTION_AT + 500,
			rights: ['sale', 'share'] as const,
		};
		const { fetch: fetchValid } = stubFetch(() =>
			json(200, { optOut: validOptOut, recordId: RECORD, subjectId: SUBJECT })
		);
		await expect(
			transportWith(fetchValid).save(savePayload())
		).resolves.toEqual({
			ok: true,
			optOut: validOptOut,
			recordId: RECORD,
			subjectId: SUBJECT,
		});

		const { fetch: fetchInvalid } = stubFetch(() =>
			json(200, {
				optOut: {
					heldBy: 'unknown',
					method: 'button',
					recordedAt: ACTION_AT,
					rights: ['sale'],
				},
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		);
		const invalidResult = await transportWith(fetchInvalid).save(savePayload());
		expect(invalidResult).toEqual({
			ok: true,
			recordId: RECORD,
			subjectId: SUBJECT,
		});
		expect('optOut' in invalidResult).toBe(false);
	});
});

describe('opt-out body builders', () => {
	test('buildV1ConsentOptOutBody produces the exact wire body without rights, with context and identity', () => {
		const body = buildV1ConsentOptOutBody(
			{
				country: 'US',
				givenAt: ACTION_AT,
				idempotencyKey: KEY,
				language: 'en',
				metadata: { source: 'footer' },
				method: 'button',
				policyId: 'us-ca',
				policySnapshotToken: 'stale-token',
				region: 'CA',
				subjectId: SUBJECT,
				uiSource: 'widget',
				user: {
					externalId: 'user_123',
					identityProvider: 'clerk',
					identityToken: 'tok_123',
				},
			},
			'www.example.com'
		);

		expect(body).toEqual({
			country: 'US',
			externalId: 'user_123',
			givenAt: ACTION_AT,
			idempotencyKey: KEY,
			identityProvider: 'clerk',
			identityToken: 'tok_123',
			language: 'en',
			metadata: { source: 'footer' },
			method: 'button',
			policyId: 'us-ca',
			policySnapshotToken: 'stale-token',
			property: 'www.example.com',
			region: 'CA',
			subjectId: SUBJECT,
			uiSource: 'widget',
		});
		expect('rights' in body).toBe(false);
		expect(
			v1ConsentOptOutInputSchema['~standard'].validate(body)
		).not.toHaveProperty('issues');
	});

	test('buildV1ConsentOptOutBody throws without an idempotencyKey', () => {
		expect(() =>
			buildV1ConsentOptOutBody(
				{
					givenAt: ACTION_AT,
					idempotencyKey: '',
					method: 'gpc',
					subjectId: SUBJECT,
					user: null,
				},
				'www.example.com'
			)
		).toThrow(/createIdempotencyKey\(\)/u);
	});

	test('buildV1ConsentOptOutLiftBody produces the exact lift wire body without rights and carries policySnapshotToken when set', () => {
		const body = buildV1ConsentOptOutLiftBody(
			{
				givenAt: ACTION_AT,
				idempotencyKey: KEY,
				policySnapshotToken: 'lift-snapshot-token',
				subjectId: SUBJECT,
				uiSource: 'dialog',
				user: {
					externalId: 'user_123',
					identityProvider: 'clerk',
					identityToken: 'tok_123',
				},
			},
			'www.example.com'
		);

		expect(body).toEqual({
			externalId: 'user_123',
			givenAt: ACTION_AT,
			idempotencyKey: KEY,
			identityProvider: 'clerk',
			identityToken: 'tok_123',
			policySnapshotToken: 'lift-snapshot-token',
			property: 'www.example.com',
			subjectId: SUBJECT,
			uiSource: 'dialog',
		});
		expect('rights' in body).toBe(false);
		expect(
			v1ConsentOptOutLiftInputSchema['~standard'].validate(body)
		).not.toHaveProperty('issues');

		const withoutToken = buildV1ConsentOptOutLiftBody(
			{
				givenAt: ACTION_AT,
				idempotencyKey: KEY,
				policySnapshotToken: null,
				subjectId: SUBJECT,
				user: null,
			},
			'www.example.com'
		);
		expect('policySnapshotToken' in withoutToken).toBe(false);
	});

	test('buildV1ConsentOptOutLiftBody throws without an idempotencyKey', () => {
		expect(() =>
			buildV1ConsentOptOutLiftBody(
				{
					givenAt: ACTION_AT,
					idempotencyKey: '',
					subjectId: SUBJECT,
					user: null,
				},
				'www.example.com'
			)
		).toThrow(/createIdempotencyKey\(\)/u);
	});
});

describe('optOut: POST /v1/consent/opt-outs', () => {
	const optOutPayload = {
		country: 'US',
		givenAt: ACTION_AT,
		idempotencyKey: KEY,
		language: 'en',
		method: 'button' as const,
		policyId: 'us-ca',
		policySnapshotToken: 'snapshot-token',
		region: 'CA',
		subjectId: SUBJECT,
		uiSource: 'widget' as const,
		user: null,
	};

	const serverOptOut = {
		heldBy: 'device' as const,
		method: 'button' as const,
		recordedAt: ACTION_AT + 10_000,
		rights: ['sale', 'share'] as const,
	};

	test('posts the body without rights and parses recordId, subjectId, optOut and link', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, {
				link: { stored: true, verifiedBy: 'identity_token' },
				optOut: serverOptOut,
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		);

		const result = await transportWith(fetch).optOut(optOutPayload);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/consent/opt-outs`);
		expect(calls[0]?.init.method).toBe('POST');
		expect(calls[0]?.body).toMatchObject({
			country: 'US',
			givenAt: ACTION_AT,
			idempotencyKey: KEY,
			language: 'en',
			method: 'button',
			policyId: 'us-ca',
			policySnapshotToken: 'snapshot-token',
			property: 'www.example.com',
			region: 'CA',
			subjectId: SUBJECT,
		});
		expect('rights' in bodyAt(calls, 0)).toBe(false);
		expect(result).toEqual({
			link: { stored: true, verifiedBy: 'identity_token' },
			ok: true,
			optOut: serverOptOut,
			recordId: RECORD,
			subjectId: SUBJECT,
		});
	});

	test('reads a null optOut, which answers a retry that arrived after a lift, as recorded with nothing to apply', async () => {
		const { fetch } = stubFetch(() =>
			json(200, { optOut: null, recordId: RECORD, subjectId: SUBJECT })
		);

		const result = await transportWith(fetch).optOut(optOutPayload);
		expect(result).toEqual({ ok: true, recordId: RECORD, subjectId: SUBJECT });
		expect('optOut' in result).toBe(false);
	});

	test('treats an invalid optOut or empty server rights in the response as no information', async () => {
		const { fetch } = stubFetch(() =>
			json(200, {
				optOut: {
					heldBy: 'device',
					method: 'bogus',
					recordedAt: ACTION_AT,
					rights: ['sale'],
				},
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		);

		const result = await transportWith(fetch).optOut(optOutPayload);
		expect(result).toEqual({
			ok: true,
			recordId: RECORD,
			subjectId: SUBJECT,
		});
		expect('optOut' in result).toBe(false);

		const { fetch: fetchEmpty } = stubFetch(() =>
			json(200, {
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: ACTION_AT,
					rights: [],
				},
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		);
		const emptyResult = await transportWith(fetchEmpty).optOut(optOutPayload);
		expect(emptyResult).toEqual({
			ok: true,
			recordId: RECORD,
			subjectId: SUBJECT,
		});
		expect('optOut' in emptyResult).toBe(false);
	});

	test('returns unsupported without throwing on 404', async () => {
		const { fetch } = stubFetch(() => v1Error(404, 'not_found'));

		await expect(transportWith(fetch).optOut(optOutPayload)).resolves.toEqual({
			ok: false,
			unsupported: true,
		});
	});

	test.each([
		[400, 'invalid_request'],
		[413, 'payload_too_large'],
	])('a %i %s is refused for good', async (status, code) => {
		const { fetch } = stubFetch(() => v1Error(status, code, 'req_opt'));

		const error = await transportWith(fetch)
			.optOut(optOutPayload)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(InthApiSaveRejectedError);
		expect(isConsentSaveRejection(error)).toBe(true);
		expect(error).toMatchObject({ code, requestId: 'req_opt', status });
	});

	test('409 subject_conflict is classified for subject recovery', async () => {
		const { fetch } = stubFetch(() => v1Error(409, 'subject_conflict'));

		const error = await transportWith(fetch)
			.optOut(optOutPayload)
			.catch((caught: unknown) => caught);

		expect(isSubjectConflict(error)).toBe(true);
	});

	test.each([
		[409, 'policy_snapshot_expired'],
		[409, 'policy_snapshot_invalid'],
		[409, 'policy_snapshot_required'],
		[409, 'conflict'],
		[401, 'unauthorized'],
		[429, 'rate_limited'],
		[500, 'server_error'],
		[502, 'bad_gateway'],
	])(
		'a %i %s stays retryable and is never treated as permanent',
		async (status, code) => {
			const { fetch } = stubFetch(() => v1Error(status, code));

			const error = await transportWith(fetch)
				.optOut(optOutPayload)
				.catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(InthApiError);
			expect(isConsentSaveRejection(error)).toBe(false);
			expect(error).toMatchObject({ code, status });
		}
	);

	test('retries a 400 whose body names no code', async () => {
		const { fetch } = stubFetch(
			() => new Response('<html>Bad</html>', { status: 400 })
		);

		const error = await transportWith(fetch)
			.optOut(optOutPayload)
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(InthApiError);
		expect(isConsentSaveRejection(error)).toBe(false);
	});
});

describe('liftOptOut: POST /v1/consent/opt-outs/lift', () => {
	const liftPayload = {
		givenAt: ACTION_AT,
		idempotencyKey: KEY,
		subjectId: SUBJECT,
		uiSource: 'dialog' as const,
		user: { externalId: 'user_123', identityToken: 'tok_123' },
	};

	test('posts without rights and parses recordId with a null or effective optOut', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { optOut: null, recordId: RECORD, subjectId: SUBJECT })
		);

		const lifted = await transportWith(fetch).liftOptOut(liftPayload);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${PROJECT_URL}/v1/consent/opt-outs/lift`);
		expect('rights' in bodyAt(calls, 0)).toBe(false);
		expect(lifted).toEqual({
			ok: true,
			optOut: null,
			recordId: RECORD,
			subjectId: SUBJECT,
		});

		const remaining = {
			heldBy: 'person' as const,
			method: 'propagated' as const,
			recordedAt: ACTION_AT - 5000,
			rights: ['sale', 'share'] as const,
		};
		const { fetch: fetchPerson } = stubFetch(() =>
			json(200, { optOut: remaining, recordId: RECORD, subjectId: SUBJECT })
		);
		await expect(
			transportWith(fetchPerson).liftOptOut(liftPayload)
		).resolves.toEqual({
			ok: true,
			optOut: remaining,
			recordId: RECORD,
			subjectId: SUBJECT,
		});
	});

	test('treats an invalid optOut in a lift answer as no information rather than null', async () => {
		const { fetch } = stubFetch(() =>
			json(200, {
				optOut: {
					heldBy: 'person',
					method: 'api',
					recordedAt: -1,
					rights: ['sale'],
				},
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		);

		const result = await transportWith(fetch).liftOptOut(liftPayload);
		expect(result).toEqual({ ok: true, recordId: RECORD, subjectId: SUBJECT });
		expect('optOut' in result).toBe(false);
	});

	test('rejects a lift answer without a record ID so the lift is resent', async () => {
		const { fetch } = stubFetch(() =>
			json(200, { optOut: null, subjectId: SUBJECT })
		);

		await expect(transportWith(fetch).liftOptOut(liftPayload)).rejects.toThrow(
			'without a subject ID and record ID'
		);
	});

	test('returns unsupported without throwing on 404', async () => {
		const { fetch } = stubFetch(() => v1Error(404, 'not_found'));

		await expect(transportWith(fetch).liftOptOut(liftPayload)).resolves.toEqual(
			{
				ok: false,
				unsupported: true,
			}
		);
	});
});

describe('keepalive on consent, opt-out and lift requests', () => {
	const KEEP_ALIVE_LIMIT = 32_768;

	test('sends save, optOut and liftOptOut with keepalive: true and leaves it off identify', async () => {
		const { calls, fetch } = stubFetch(
			() => json(200, { recordId: RECORD, subjectId: SUBJECT }),
			() =>
				json(200, {
					optOut: {
						heldBy: 'device',
						method: 'button',
						recordedAt: ACTION_AT,
						rights: ['sale', 'share'],
					},
					recordId: RECORD,
					subjectId: SUBJECT,
				}),
			() => json(200, { optOut: null, recordId: RECORD, subjectId: SUBJECT }),
			() =>
				json(200, {
					externalId: 'user_123',
					subjectId: SUBJECT,
					verifiedBy: 'identity_token',
				})
		);
		const transport = transportWith(fetch);

		await transport.save(savePayload());
		await transport.optOut({
			givenAt: ACTION_AT,
			idempotencyKey: KEY,
			method: 'button',
			subjectId: SUBJECT,
			user: null,
		});
		await transport.liftOptOut({
			givenAt: ACTION_AT,
			idempotencyKey: KEY,
			subjectId: SUBJECT,
			user: null,
		});
		await transport.identify(
			{ externalId: 'user_123', identityToken: 'token' },
			SUBJECT
		);

		expect(calls).toHaveLength(4);
		expect(calls[0]?.init.keepalive).toBe(true);
		expect(calls[1]?.init.keepalive).toBe(true);
		expect(calls[2]?.init.keepalive).toBe(true);
		expect('keepalive' in (calls[3]?.init ?? {})).toBe(false);
	});

	test('omits keepalive when the serialized body exceeds the UTF-8 byte threshold', async () => {
		const { calls, fetch } = stubFetch(() =>
			json(200, { recordId: RECORD, subjectId: SUBJECT })
		);
		const transport = transportWith(fetch);

		// ASCII body larger than 32 KiB.
		await transport.save(
			savePayload({
				user: {
					externalId: 'user_123',
					properties: { blob: 'a'.repeat(KEEP_ALIVE_LIMIT) },
				},
			})
		);
		expect('keepalive' in (calls[0]?.init ?? {})).toBe(false);

		// Multi-byte UTF-8 body: string length is well below 32,768 characters,
		// while the UTF-8 byte length exceeds 32,768 bytes (3 bytes per char).
		const multibyte = '\u4e2d'.repeat(12_000);
		expect(multibyte.length).toBeLessThan(KEEP_ALIVE_LIMIT);
		expect(new TextEncoder().encode(multibyte).byteLength).toBeGreaterThan(
			KEEP_ALIVE_LIMIT
		);
		await transport.save(
			savePayload({
				user: {
					externalId: 'user_123',
					properties: { blob: multibyte },
				},
			})
		);
		expect(String(calls[1]?.init.body).length).toBeLessThan(KEEP_ALIVE_LIMIT);
		expect('keepalive' in (calls[1]?.init ?? {})).toBe(false);

		// Body below the threshold still carries keepalive: true.
		await transport.save(
			savePayload({
				user: {
					externalId: 'user_123',
					properties: { blob: 'a'.repeat(1024) },
				},
			})
		);
		expect(calls[2]?.init.keepalive).toBe(true);
	});
});
