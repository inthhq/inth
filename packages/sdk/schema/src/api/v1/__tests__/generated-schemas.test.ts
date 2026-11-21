import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import {
	consentRecordRequestSchema,
	documentPublishRequestSchema,
	getV1ConsentInitQuerySchema,
	identityTokenResponseSchema,
	postV1DocumentsAcceptancesBodySchema,
	vendorCategoryConditionSchema,
} from '../generated/schemas';

/*
 * What the schemas generated from the backend's document check, one case
 * for each way the generator turns a keyword into Valibot.
 */

const receipt = {
	basis: { fingerprint: 'fp', kind: 'choice-v1' },
	confirmedAt: 1_763_467_200_000,
	value: true,
};

const record = {
	answer: { categories: { measurement: receipt } },
	confirmed: ['measurement'],
	givenAt: 1_763_467_200_000,
	idempotencyKey: '0193e5a8-7c1e-7b7a-9d7e-2f0c9a3b4d5e',
	property: 'www.example.com',
	subjectId: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
};

describe('generated /v1 schemas', () => {
	it('accept a consent record the contract describes', () => {
		expect(v.parse(consentRecordRequestSchema, record)).toEqual(record);
	});

	it('refuse a key additionalProperties: false leaves out', () => {
		const answer = { categories: { measurement: receipt }, extra: true };
		expect(v.is(consentRecordRequestSchema, { ...record, answer })).toBe(false);
	});

	it.each([
		['a property against its pattern', { property: 'WWW.example.com' }],
		['a property past maxLength', { property: 'a'.repeat(254) }],
		['an idempotency key that is not a UUID', { idempotencyKey: 'key-1' }],
		['a fractional integer', { givenAt: 1.5 }],
		['an integer past maximum', { givenAt: 8_640_000_000_000_001 }],
		['a value outside an enum', { confirmed: ['analytics'] }],
	])('refuse %s', (_name, change) => {
		expect(v.is(consentRecordRequestSchema, { ...record, ...change })).toBe(
			false
		);
	});

	it('refuse a body without a required key', () => {
		const { subjectId: _subjectId, ...rest } = record;
		expect(v.is(consentRecordRequestSchema, rest)).toBe(false);
	});

	it('pick the branch of a oneOf by the key that tells them apart', () => {
		const legacy = { ...receipt, basis: { kind: 'legacy-v2' } };
		const unknown = { ...receipt, basis: { kind: 'choice-v2' } };
		const answer = (value: unknown) => ({
			...record,
			answer: { categories: { measurement: value } },
		});
		expect(v.is(consentRecordRequestSchema, answer(legacy))).toBe(true);
		const result = v.safeParse(consentRecordRequestSchema, answer(unknown));
		expect(result.issues?.[0]?.path?.map((item) => item.key)).toEqual([
			'answer',
			'categories',
			'measurement',
			'basis',
			'kind',
		]);
	});

	it('fill a default the document gives', () => {
		const body = {
			effectiveDate: '2026-11-18',
			hash: 'sha256:abc',
			version: '2026-11-18',
		};
		expect(v.parse(documentPublishRequestSchema, body)).toEqual({
			...body,
			requiresAcceptance: true,
		});
	});

	it('apply minItems and maxItems', () => {
		const body = {
			acceptances: [{ hash: 'sha256:abc', type: 'privacy_policy' }],
			acceptedAt: 1_763_467_200_000,
			idempotencyKey: record.idempotencyKey,
			subjectId: record.subjectId,
		};
		expect(v.is(postV1DocumentsAcceptancesBodySchema, body)).toBe(true);
		expect(
			v.is(postV1DocumentsAcceptancesBodySchema, { ...body, acceptances: [] })
		).toBe(false);
		const many = Array.from({ length: 21 }, () => body.acceptances[0]);
		expect(
			v.is(postV1DocumentsAcceptancesBodySchema, { ...body, acceptances: many })
		).toBe(false);
	});

	it('read a recursive condition', () => {
		const condition = {
			and: [{ not: 'marketing' }, { or: ['measurement', 'experience'] }],
		};
		expect(v.parse(vendorCategoryConditionSchema, condition)).toEqual(
			condition
		);
		expect(v.is(vendorCategoryConditionSchema, { and: [] })).toBe(false);
		expect(
			v.is(vendorCategoryConditionSchema, { not: { or: 'analytics' } })
		).toBe(false);
	});

	it('take query parameters as the strings a URL holds', () => {
		expect(v.is(getV1ConsentInitQuerySchema, { gpc: '1' })).toBe(true);
		expect(v.is(getV1ConsentInitQuerySchema, { gpc: 'true' })).toBe(false);
	});

	it('check a format', () => {
		const token = { expiresAt: '2026-11-21T10:00:00.000Z', token: 'tok' };
		expect(v.is(identityTokenResponseSchema, token)).toBe(true);
		expect(
			v.is(identityTokenResponseSchema, { ...token, expiresAt: 'tomorrow' })
		).toBe(false);
	});
});
