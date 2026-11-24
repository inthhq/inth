import * as v from 'valibot';
import { describe, expect, it } from 'vite-plus/test';

import {
	v1CanonicalSubjectIdSchema,
	v1ConsentOptOutInputSchema,
	v1ConsentOptOutLiftInputSchema,
	v1ConsentOptOutLiftOutputSchema,
	v1ConsentOptOutOutputSchema,
	v1ConsentRecordInputSchema,
	v1ConsentRecordOutputSchema,
	v1ConsentSessionReportSchema,
	v1DocumentAcceptancesInputSchema,
	v1DocumentAcceptancesOutputSchema,
	v1DocumentCheckOutputSchema,
	v1DocumentCurrentOutputSchema,
	v1DocumentPublishInputSchema,
	v1DocumentTypeSchema,
	v1ErrorBodySchema,
	v1PropertySchema,
	v1IdempotencyKeySchema,
	v1SubjectIdSchema,
	v1SubjectLinkInputSchema,
	v1SubjectLinkOutputSchema,
	v1SubjectLinkParamsSchema,
} from './index';

const SUBJECT = '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c';
const KEY = '0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e';
const HASH =
	'sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

const contractRecord = {
	answer: {
		categories: {
			marketing: {
				basis: { fingerprint: 'fp', kind: 'choice-v1' },
				confirmedAt: 1_760_000_000_000,
				value: false,
			},
			measurement: {
				basis: { fingerprint: 'fp', kind: 'choice-v1' },
				confirmedAt: 1_763_467_200_000,
				value: true,
			},
		},
	},
	confirmed: ['measurement'],
	consentAction: 'custom',
	givenAt: 1_763_467_200_000,
	idempotencyKey: KEY,
	property: 'www.example.com',
	subjectId: SUBJECT,
};

describe('v1 subject IDs', () => {
	it.each([SUBJECT, 'sub_2VZxR7YmNpKq3WfLs8TgHd'])(
		'accepts %s in a request',
		(id) => {
			expect(v.is(v1SubjectIdSchema, id)).toBe(true);
		}
	);

	it.each([
		['an uppercase UUIDv7', SUBJECT.toUpperCase()],
		['a UUIDv4', '0193e5a8-6f00-4c3a-8a1b-5d2e7f9a0b1c'],
		['a wrong variant', '0193e5a8-6f00-7c3a-ca1b-5d2e7f9a0b1c'],
		['the nil UUID', '00000000-0000-0000-0000-000000000000'],
		['the max UUID', 'ffffffff-ffff-ffff-ffff-ffffffffffff'],
		['a sub_ ID with a 0', 'sub_0abc'],
		['an empty sub_ ID', 'sub_'],
	])('rejects %s', (_label, id) => {
		expect(v.is(v1SubjectIdSchema, id)).toBe(false);
	});

	it('names only the UUID as canonical', () => {
		expect(v.is(v1CanonicalSubjectIdSchema, SUBJECT)).toBe(true);
		expect(v.is(v1CanonicalSubjectIdSchema, 'sub_2VZxR7YmNpKq3WfLs8TgHd')).toBe(
			false
		);
	});
});

describe('v1 property', () => {
	it.each([
		'www.example.com',
		'localhost',
		'com.example.app',
		'my_app.id',
		'-x._y',
		`${'a'.repeat(249)}.com`,
	])('accepts %s', (value) => {
		expect(v.is(v1PropertySchema, value)).toBe(true);
	});

	it.each([
		'https://example.com',
		'example.com:8080',
		'example.com/path',
		'Example.com',
		'',
		'.example.com',
		'example.com.',
		'a..b',
		`${'a'.repeat(250)}.com`,
	])('rejects %s', (value) => {
		expect(v.is(v1PropertySchema, value)).toBe(false);
	});
});

describe('v1 idempotency key', () => {
	it('accepts a lowercase UUID of any version', () => {
		expect(v.is(v1IdempotencyKeySchema, KEY)).toBe(true);
		expect(
			v.is(v1IdempotencyKeySchema, '0193e5a8-7c1e-8b7a-9d7e-2f0c9a3b4d5e')
		).toBe(true);
	});

	it('rejects an uppercase UUID', () => {
		expect(v.is(v1IdempotencyKeySchema, KEY.toUpperCase())).toBe(false);
	});
});

describe('POST /v1/consent/records', () => {
	it('accepts the contract example', () => {
		expect(
			v.safeParse(v1ConsentRecordInputSchema, contractRecord).success
		).toBe(true);
	});

	it('accepts an empty confirmed list and a carried-over receipt', () => {
		const result = v.safeParse(v1ConsentRecordInputSchema, {
			...contractRecord,
			answer: {
				categories: {
					measurement: {
						basis: { kind: 'legacy-v2', materialFingerprint: 'm' },
						confirmedAt: 1_700_000_000_000,
						value: true,
					},
				},
			},
			confirmed: [],
		});
		expect(result.success).toBe(true);
	});

	it('rejects a confirmed category without a receipt in answer', () => {
		const result = v.safeParse(v1ConsentRecordInputSchema, {
			...contractRecord,
			confirmed: ['functionality'],
		});
		expect(result.success).toBe(false);
	});

	it('rejects a fractional givenAt', () => {
		expect(
			v.safeParse(v1ConsentRecordInputSchema, {
				...contractRecord,
				givenAt: 1_763_467_200_000.5,
			}).success
		).toBe(false);
	});

	it.each([
		['a sub_ subject ID', { subjectId: 'sub_2VZxR7YmNpKq3WfLs8TgHd' }, true],
		[
			'a UUIDv4 subject ID',
			{ subjectId: '0193e5a8-6f00-4c3a-8a1b-5d2e7f9a0b1c' },
			false,
		],
		[
			'an uppercase idempotency key',
			{ idempotencyKey: KEY.toUpperCase() },
			false,
		],
	])('takes %s: %s', (_label, change, valid) => {
		expect(
			v.is(v1ConsentRecordInputSchema, { ...contractRecord, ...change })
		).toBe(valid);
	});

	it.each([
		['an answer', { answer: [] }],
		['the categories of an answer', { answer: { categories: [] } }],
		['the metadata', { metadata: [] }],
	])('refuses an array as %s', (_label, change) => {
		// No confirmed category, so the receipt check passes and only the
		// shape of the change can refuse the body.
		const body = { ...contractRecord, confirmed: [], ...change };
		expect(v.is(v1ConsentRecordInputSchema, body)).toBe(false);
	});

	const receipt = contractRecord.answer.categories.measurement;

	it.each([
		['a Date as the categories', { answer: { categories: new Date(0) } }],
		['a Map as the categories', { answer: { categories: new Map() } }],
		[
			'an answer that inherits its categories',
			{ answer: Object.create({ categories: {} }) },
		],
		[
			'a key the categories inherit',
			{ answer: JSON.parse('{"categories":{"toString":1}}') },
		],
		[
			'an array with a kind as a basis',
			{
				answer: {
					categories: {
						measurement: {
							...receipt,
							basis: Object.assign([], { kind: 'legacy-v2' }),
						},
					},
				},
			},
		],
		[
			'a Map as the vendor grants',
			{
				vendorChoice: {
					confirmedAt: 1_763_467_200_000,
					grants: new Map(),
					version: 1,
				},
			},
		],
	])('refuses %s', (_label, change) => {
		// No confirmed category, so the receipt check passes and only the
		// shape of the change can refuse the body.
		const body = { ...contractRecord, confirmed: [], ...change };
		expect(v.is(v1ConsentRecordInputSchema, body)).toBe(false);
	});

	it('rejects a body without an idempotency key', () => {
		const { idempotencyKey: _key, ...rest } = contractRecord;
		expect(v.safeParse(v1ConsentRecordInputSchema, rest).success).toBe(false);
	});

	it('rejects an answer with a field besides categories, at its path', () => {
		const result = v.safeParse(v1ConsentRecordInputSchema, {
			...contractRecord,
			answer: { ...contractRecord.answer, version: 3 },
		});
		expect(result.issues?.map((issue) => v.getDotPath(issue))).toEqual([
			'answer.version',
		]);
	});

	it('accepts a partial answer that leaves categories out', () => {
		const result = v.safeParse(v1ConsentRecordInputSchema, {
			...contractRecord,
			answer: {
				categories: {
					measurement: contractRecord.answer.categories.measurement,
				},
			},
		});
		expect(result.success).toBe(true);
	});

	it('reads epoch milliseconds for givenAt and confirmedAt', () => {
		expect(
			v.safeParse(v1ConsentRecordInputSchema, {
				...contractRecord,
				givenAt: '2026-11-18T00:00:00.000Z',
			}).success
		).toBe(false);
	});
});

describe('POST /v1/consent/records answer', () => {
	const RECORD = '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d';

	it('reads subjectId and recordId', () => {
		expect(
			v.is(v1ConsentRecordOutputSchema, {
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		).toBe(true);
	});

	it.each([
		{ stored: true, verifiedBy: 'identity_token' },
		{ reason: 'unverified', stored: false },
		{ reason: 'invalid_token', stored: false },
		{ reason: 'refused', stored: false },
	])('reads the link %o', (link) => {
		const result = v.parse(v1ConsentRecordOutputSchema, {
			link,
			recordId: RECORD,
			subjectId: SUBJECT,
		});
		expect(result.link).toEqual(link);
	});

	it('rejects a subject ID that is a UUID but not a UUIDv7', () => {
		expect(
			v.is(v1ConsentRecordOutputSchema, {
				recordId: RECORD,
				subjectId: '0193e5a8-6f00-4c3a-8a1b-5d2e7f9a0b1c',
			})
		).toBe(false);
	});

	it('rejects an answer without a recordId', () => {
		expect(
			v.safeParse(v1ConsentRecordOutputSchema, { subjectId: SUBJECT }).success
		).toBe(false);
	});

	it('reads an optional effective optOut', () => {
		const optOut = {
			heldBy: 'person' as const,
			method: 'api' as const,
			recordedAt: 1_763_467_200_000,
			rights: ['sale', 'share'] as const,
		};
		const result = v.parse(v1ConsentRecordOutputSchema, {
			optOut,
			recordId: RECORD,
			subjectId: SUBJECT,
		});
		expect(result.optOut).toEqual(optOut);
	});
});

describe('POST /v1/consent/opt-outs', () => {
	const RECORD = '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d';
	const effectiveOptOut = {
		heldBy: 'device' as const,
		method: 'button' as const,
		recordedAt: 1_763_467_200_500,
		rights: ['sale', 'share'] as const,
	};
	const optOutBody = {
		country: 'US',
		givenAt: 1_763_467_200_000,
		idempotencyKey: KEY,
		language: 'en',
		method: 'button' as const,
		policyId: 'us-ca',
		policySnapshotToken: 'snapshot-token',
		property: 'www.example.com',
		region: 'CA',
		subjectId: SUBJECT,
		uiSource: 'widget',
	};

	it('accepts a valid opt-out request with or without rights, context and identity fields', () => {
		expect(v.safeParse(v1ConsentOptOutInputSchema, optOutBody).success).toBe(
			true
		);
		expect(
			v.safeParse(v1ConsentOptOutInputSchema, {
				...optOutBody,
				externalId: 'user_123',
				identityProvider: 'clerk',
				identityToken: 'tok',
				metadata: { source: 'footer' },
				rights: ['sale', 'share'] as const,
			}).success
		).toBe(true);
		expect(
			v.safeParse(v1ConsentOptOutInputSchema, {
				...optOutBody,
				method: 'gpc',
			}).success
		).toBe(true);
	});

	it('rejects empty, duplicate or invalid opt-out rights and non-client methods', () => {
		expect(
			v.is(v1ConsentOptOutInputSchema, { ...optOutBody, rights: [] })
		).toBe(false);
		expect(
			v.is(v1ConsentOptOutInputSchema, {
				...optOutBody,
				rights: ['sale', 'sale'],
			})
		).toBe(false);
		expect(
			v.is(v1ConsentOptOutInputSchema, { ...optOutBody, method: 'api' })
		).toBe(false);
	});

	it('reads the opt-out answer', () => {
		const parsed = v.parse(v1ConsentOptOutOutputSchema, {
			link: { stored: true, verifiedBy: 'identity_token' },
			optOut: effectiveOptOut,
			recordId: RECORD,
			subjectId: SUBJECT,
		});
		expect(parsed.optOut).toEqual(effectiveOptOut);
	});

	it('reads the optional device row on effective opt-out answers and rejects invalid device payloads', () => {
		const withDevice = {
			...effectiveOptOut,
			device: {
				rights: ['sale', 'share'] as const,
				writtenAt: 1_763_467_205_000,
			},
			heldBy: 'both' as const,
			rights: ['sale', 'share', 'targeted_ads'] as const,
		};
		const parsed = v.parse(v1ConsentOptOutOutputSchema, {
			optOut: withDevice,
			recordId: RECORD,
			subjectId: SUBJECT,
		});
		expect(parsed.optOut).toEqual(withDevice);
		expect(
			v.is(v1ConsentOptOutOutputSchema, {
				optOut: {
					...withDevice,
					device: { rights: [], writtenAt: 1_763_467_205_000 },
				},
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		).toBe(false);
		expect(
			v.is(v1ConsentOptOutOutputSchema, {
				optOut: {
					...withDevice,
					device: { rights: ['sale'], writtenAt: -1 },
				},
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		).toBe(false);
	});

	it('reads a null opt-out, the answer to a retry that arrived after a lift', () => {
		expect(
			v.parse(v1ConsentOptOutOutputSchema, {
				optOut: null,
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		).toEqual({ optOut: null, recordId: RECORD, subjectId: SUBJECT });
	});
});

describe('POST /v1/consent/opt-outs/lift', () => {
	const RECORD = '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d';
	const liftBody = {
		givenAt: 1_763_467_200_000,
		idempotencyKey: KEY,
		property: 'www.example.com',
		subjectId: SUBJECT,
		uiSource: 'dialog',
	};

	it('accepts a lift body with or without rights and policySnapshotToken', () => {
		expect(v.is(v1ConsentOptOutLiftInputSchema, liftBody)).toBe(true);
		expect(
			v.is(v1ConsentOptOutLiftInputSchema, {
				...liftBody,
				externalId: 'user_123',
				identityToken: 'tok',
				policySnapshotToken: 'snapshot-token',
				rights: ['sale'],
			})
		).toBe(true);
	});

	it('reads a lift answer with null or an effective opt-out, and requires recordId', () => {
		expect(
			v.parse(v1ConsentOptOutLiftOutputSchema, {
				optOut: null,
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		).toEqual({ optOut: null, recordId: RECORD, subjectId: SUBJECT });
		expect(
			v.is(v1ConsentOptOutLiftOutputSchema, {
				optOut: null,
				subjectId: SUBJECT,
			})
		).toBe(false);
		expect(
			v.parse(v1ConsentOptOutLiftOutputSchema, {
				optOut: {
					heldBy: 'person',
					method: 'propagated',
					recordedAt: 1_763_467_200_500,
					rights: ['sale', 'share'],
				},
				recordId: RECORD,
				subjectId: SUBJECT,
			})
		).toMatchObject({
			optOut: { heldBy: 'person', method: 'propagated' },
			recordId: RECORD,
			subjectId: SUBJECT,
		});
	});
});

describe('POST /v1/consent/sessions', () => {
	it('names the journey site property', () => {
		const result = v.safeParse(v1ConsentSessionReportSchema, {
			country: 'DE',
			gpc: false,
			journey: {
				id: '6f1c2f0e-58a4-4c2e-9d8f-0a1b2c3d4e5f',
				prompt: 'due',
				property: 'www.example.com',
				scope: 'page',
				storedChoice: false,
			},
			language: 'de',
			policy: null,
			region: null,
			resolution: 'no-match',
			revision: 'r1',
			source: 'render',
		});
		expect(result.success).toBe(true);
	});
});

describe('POST /v1/subjects/:id/link', () => {
	it.each([
		[SUBJECT, true],
		['sub_2VZxR7YmNpKq3WfLs8TgHd', true],
		[SUBJECT.toUpperCase(), false],
		['user_123', false],
	])('takes %s as the subject in the path: %s', (id, valid) => {
		expect(v.is(v1SubjectLinkParamsSchema, { id })).toBe(valid);
	});

	it('rejects an empty identity provider', () => {
		expect(
			v.is(v1SubjectLinkInputSchema, {
				externalId: 'user_123',
				identityProvider: '',
			})
		).toBe(false);
	});

	it('reads the answer', () => {
		expect(
			v.is(v1SubjectLinkOutputSchema, {
				externalId: 'user_123',
				subjectId: SUBJECT,
				verifiedBy: 'identity_token',
			})
		).toBe(true);
		expect(
			v.is(v1SubjectLinkOutputSchema, {
				externalId: 'user_123',
				optOut: {
					heldBy: 'person',
					method: 'api',
					recordedAt: 1_763_467_200_000,
					rights: ['sale', 'share'],
				},
				subjectId: SUBJECT,
				verifiedBy: 'identity_token',
			})
		).toBe(true);
	});

	it('rejects an answer whose subject is not a UUIDv7', () => {
		expect(
			v.is(v1SubjectLinkOutputSchema, {
				externalId: 'user_123',
				subjectId: '0193e5a8-6f00-4c3a-8a1b-5d2e7f9a0b1c',
				verifiedBy: 'identity_token',
			})
		).toBe(false);
	});
});

describe('documents', () => {
	it.each(['privacy_policy', 'terms_us', 'terms_eu', 'a1'])(
		'accepts the type %s',
		(type) => {
			expect(v.is(v1DocumentTypeSchema, type)).toBe(true);
		}
	);

	it.each(['Terms', '1terms', 'terms-us', ''])(
		'rejects the type %s',
		(type) => {
			expect(v.is(v1DocumentTypeSchema, type)).toBe(false);
		}
	);

	it('defaults requiresAcceptance to true on publish', () => {
		const result = v.parse(v1DocumentPublishInputSchema, {
			effectiveDate: '2026-11-18T00:00:00.000Z',
			hash: HASH,
			version: '2026-11-18',
		});
		expect(result.requiresAcceptance).toBe(true);
	});

	it.each([
		['a date', '2026-11-18', true],
		['a date and time with a zone', '2026-11-18T00:00:00+01:00', true],
		['a date and time without a zone', '2026-11-18T00:00:00', false],
		['a leap day', '2028-02-29', true],
		['February 29 in a common year', '2026-02-29', false],
		['a day past the month', '2026-02-31T00:00:00.000Z', false],
	])('takes %s as the effective date on publish', (_label, date, valid) => {
		expect(
			v.is(v1DocumentPublishInputSchema, {
				effectiveDate: date,
				hash: HASH,
				version: '2026-11-18',
			})
		).toBe(valid);
	});

	const current = {
		effectiveDate: '2026-11-18T00:00:00.000Z',
		hash: HASH,
		id: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
		requiresAcceptance: true,
		type: 'terms_us',
		version: '2026-11-18',
	};

	it.each([
		['June 30', '2026-06-30T00:00:00.000Z', true],
		['June 31', '2026-06-31T00:00:00.000Z', false],
	])('reads a current document dated %s', (_label, effectiveDate, valid) => {
		expect(
			v.is(v1DocumentCurrentOutputSchema, {
				document: { ...current, effectiveDate },
			})
		).toBe(valid);
	});

	it('refuses a current document whose hash is not lowercase sha256 hex', () => {
		expect(
			v.is(v1DocumentCurrentOutputSchema, {
				document: { ...current, hash: HASH.toUpperCase() },
			})
		).toBe(false);
	});

	it('refuses a current document without id', () => {
		const { id: _id, ...document } = current;
		expect(v.is(v1DocumentCurrentOutputSchema, { document })).toBe(false);
	});

	it('rejects a hash that is not lowercase sha256 hex', () => {
		const result = v.safeParse(v1DocumentPublishInputSchema, {
			effectiveDate: '2026-11-18T00:00:00.000Z',
			hash: HASH.toUpperCase(),
			version: '2026-11-18',
		});
		expect(result.success).toBe(false);
	});

	const acceptances = {
		acceptances: [
			{ hash: HASH, type: 'terms_us' },
			{ hash: HASH, type: 'privacy_policy' },
		],
		acceptedAt: 1_763_467_200_000,
		idempotencyKey: KEY,
	};

	it('needs a subject ID or an external ID', () => {
		expect(
			v.safeParse(v1DocumentAcceptancesInputSchema, acceptances).success
		).toBe(false);
		expect(
			v.safeParse(v1DocumentAcceptancesInputSchema, {
				...acceptances,
				subjectId: SUBJECT,
			}).success
		).toBe(true);
		expect(
			v.safeParse(v1DocumentAcceptancesInputSchema, {
				...acceptances,
				externalId: 'user_123',
				identityToken: 't',
			}).success
		).toBe(true);
	});

	it.each([
		['an IPv4 address', '203.0.113.7', true],
		['an IPv6 address', '2001:db8::1', true],
		['a host name', 'example.com', false],
	])('takes %s as the context IP address: %s', (_label, ipAddress, valid) => {
		expect(
			v.is(v1DocumentAcceptancesInputSchema, {
				...acceptances,
				context: { ipAddress, userAgent: 'test' },
				subjectId: SUBJECT,
			})
		).toBe(valid);
	});

	it.each(['', 'proof-token', HASH.toUpperCase(), HASH.slice(0, -1)])(
		'refuses an acceptance with the hash %j',
		(hash) => {
			expect(
				v.is(v1DocumentAcceptancesInputSchema, {
					...acceptances,
					acceptances: [{ hash, type: 'terms_us' }],
					subjectId: SUBJECT,
				})
			).toBe(false);
		}
	);

	const recorded = {
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

	it.each([
		['the recorded acceptances', {}, true],
		[
			'a subject that is not a UUIDv7',
			{ subjectId: '0193e5a8-6f00-4c3a-8a1b-5d2e7f9a0b1c' },
			false,
		],
		[
			'an uppercase hash',
			{
				acceptances: [{ ...recorded.acceptances[0], hash: HASH.toUpperCase() }],
			},
			false,
		],
	])('reads %s in the answer: %s', (_label, change, valid) => {
		expect(
			v.is(v1DocumentAcceptancesOutputSchema, { ...recorded, ...change })
		).toBe(valid);
	});

	it.each([
		['an uppercase idempotency key', { idempotencyKey: KEY.toUpperCase() }],
		[
			'a UUIDv4 subject ID',
			{ subjectId: '0193e5a8-6f00-4c3a-8a1b-5d2e7f9a0b1c' },
		],
		['an array as the context', { context: [] }],
	])('refuses acceptances with %s', (_label, change) => {
		expect(
			v.is(v1DocumentAcceptancesInputSchema, {
				...acceptances,
				subjectId: SUBJECT,
				...change,
			})
		).toBe(false);
	});

	it.each([
		[0, false],
		[1, true],
		[20, true],
		[21, false],
	])('takes %i acceptances: %s', (count, valid) => {
		expect(
			v.is(v1DocumentAcceptancesInputSchema, {
				...acceptances,
				acceptances: Array.from({ length: count }, () => ({
					hash: HASH,
					type: 'terms_us',
				})),
				subjectId: SUBJECT,
			})
		).toBe(valid);
	});
});

describe('GET /v1/documents/check', () => {
	const result = { accepted: true, acceptedLatest: false };

	it('keeps the result of every type, including one named constructor', () => {
		const output = v.parse(
			v1DocumentCheckOutputSchema,
			JSON.parse(
				JSON.stringify({
					documents: { constructor: result, terms_us: result },
				})
			)
		);
		expect(Object.keys(output.documents)).toEqual(['constructor', 'terms_us']);
	});

	it('refuses an answer with no result', () => {
		expect(
			v.safeParse(v1DocumentCheckOutputSchema, { documents: {} }).success
		).toBe(false);
	});

	it('refuses a malformed result', () => {
		expect(
			v.safeParse(v1DocumentCheckOutputSchema, {
				documents: { terms_us: { accepted: 'yes', acceptedLatest: false } },
			}).success
		).toBe(false);
	});
});

describe('v1 error body', () => {
	it('reads the code, details and request ID', () => {
		const body = v.parse(v1ErrorBodySchema, {
			error: {
				code: 'invalid_request',
				details: { fieldErrors: { property: ['Required'] }, formErrors: [] },
				message: 'Invalid body',
			},
			requestId: 'req_1',
		});
		expect(body.error.code).toBe('invalid_request');
		expect(body.requestId).toBe('req_1');
	});

	it('reads a code the document does not list yet', () => {
		const body = v.parse(v1ErrorBodySchema, {
			error: { code: 'quota_exceeded', message: 'Over quota' },
			requestId: 'req_2',
		});
		expect(body.error.code).toBe('quota_exceeded');
	});
});
