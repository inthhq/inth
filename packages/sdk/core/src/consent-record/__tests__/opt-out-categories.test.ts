/**
 * Which categories an opt-out withholds (DEF-09): the policy's GPC mapping
 * for a new opt-out, joined with what a held record was made with.
 */
import type { OptOutRecord } from '@inth/sdk-schema/types';
import { describe, expect, it } from 'vite-plus/test';

import { validateOptOutRecord } from '../consent-record-validation.model';
import { evaluateConsentRecord } from '../evaluate';
import {
	answersHeldOptOut,
	carryOptOutCategories,
	optOutDenyCategories,
	unionOptOutCategories,
} from '../opt-out-rules.model';
import {
	LEGACY_OPT_OUT_CATEGORIES,
	optOutDecidingCategory,
	policyOptOutCategories,
} from '../types';
import type { OptionalConsentCategory } from '../types';
import { makePolicy, NOW } from './fixtures';

const ALL_OPTIONAL: readonly OptionalConsentCategory[] = [
	'functionality',
	'experience',
	'measurement',
	'marketing',
];

const optOutPolicy = (
	gpcDenyCategories: readonly OptionalConsentCategory[],
	scope: readonly OptionalConsentCategory[] = ALL_OPTIONAL
) =>
	makePolicy({
		gpcDenyCategories,
		model: 'opt-out',
		prompt: 'none',
		scope: [...scope],
	});

const record = { heldBy: 'device', method: 'gpc', recordedAt: NOW - 1 };

describe('policyOptOutCategories', () => {
	it('[GPC-01] follows the GPC mapping, deciding category first', () => {
		expect(policyOptOutCategories(optOutPolicy(['marketing']))).toEqual([
			'marketing',
		]);
		expect(
			policyOptOutCategories(optOutPolicy(['measurement', 'marketing']))
		).toEqual(['marketing', 'measurement']);
		expect(optOutDecidingCategory(optOutPolicy(['measurement']))).toBe(
			'measurement'
		);
	});

	it('falls back to marketing and measurement when the rule maps no GPC categories', () => {
		expect(policyOptOutCategories(optOutPolicy([]))).toEqual([
			...LEGACY_OPT_OUT_CATEGORIES,
		]);
		expect(
			policyOptOutCategories(optOutPolicy([], ['functionality', 'measurement']))
		).toEqual(['measurement']);
		expect(
			optOutDecidingCategory(optOutPolicy([], ['functionality']))
		).toBeNull();
	});
});

describe('optOutDenyCategories', () => {
	it('is the policy part alone without a record', () => {
		expect(optOutDenyCategories(optOutPolicy(['marketing']))).toEqual([
			'marketing',
		]);
		expect(optOutDenyCategories(optOutPolicy(['marketing']), null)).toEqual([
			'marketing',
		]);
	});

	it('[GPC-05] treats a record without categories as made under the legacy mapping', () => {
		expect(optOutDenyCategories(optOutPolicy(['marketing']), {})).toEqual([
			'marketing',
			'measurement',
		]);
	});

	it('[GPC-05] joins what the record was made with and what the policy maps today', () => {
		const policy = optOutPolicy(['marketing', 'experience']);
		expect(
			optOutDenyCategories(policy, { categories: ['measurement'] })
		).toEqual(['marketing', 'measurement', 'experience']);
		// An empty list is a real list: only the policy's part applies.
		expect(optOutDenyCategories(policy, { categories: [] })).toEqual([
			'marketing',
			'experience',
		]);
	});

	it('never reaches outside the policy scope', () => {
		expect(
			optOutDenyCategories(optOutPolicy([], ['functionality', 'marketing']), {
				categories: ['measurement', 'marketing'],
			})
		).toEqual(['marketing']);
	});
});

describe('evaluateConsentRecord with a held opt-out', () => {
	const evaluate = (categories?: ('marketing' | 'measurement')[]) => {
		const validated = validateOptOutRecord({
			...record,
			...(categories && { categories }),
			rights: ['sale', 'share', 'targeted_ads'],
		});
		if (!validated.ok) {
			throw new Error('fixture record is invalid');
		}
		return evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			optOut: validated.record,
			policy: optOutPolicy(['marketing']),
		}).permissions;
	};

	it('[GPC-01] a marketing-only record leaves measurement permitted', () => {
		expect(evaluate(['marketing'])).toMatchObject({
			marketing: false,
			measurement: true,
		});
	});

	it('[GPC-05] a legacy record without categories denies both', () => {
		expect(evaluate()).toMatchObject({
			marketing: false,
			measurement: false,
		});
	});

	it('[GPC-05] a record made with both keeps both after the policy narrows', () => {
		expect(evaluate(['measurement', 'marketing'])).toMatchObject({
			marketing: false,
			measurement: false,
		});
	});
});

describe('joining copies of a held opt-out (GPC-05)', () => {
	it('reads a missing list as legacy and never as withholding nothing', () => {
		expect(unionOptOutCategories(undefined, undefined)).toBeUndefined();
		expect(unionOptOutCategories(['marketing'], undefined)).toBeUndefined();
		expect(unionOptOutCategories([], undefined)).toBeUndefined();
		expect(unionOptOutCategories(['experience'], undefined)).toEqual([
			'experience',
			'measurement',
			'marketing',
		]);
		expect(unionOptOutCategories(['marketing'], ['experience'])).toEqual([
			'experience',
			'marketing',
		]);
		expect(unionOptOutCategories([], [])).toEqual([]);
	});

	const act: OptOutRecord = {
		heldBy: 'device',
		method: 'button',
		recordedAt: NOW,
		rights: ['sale'],
	};

	it('takes the defined list for the same act, and joins otherwise', () => {
		const held: OptOutRecord = { ...act, categories: ['marketing'] };
		const answer: OptOutRecord = { ...act, heldBy: 'both', rights: [] };
		expect(carryOptOutCategories(answer, held, true).categories).toEqual([
			'marketing',
		]);
		expect(carryOptOutCategories(held, answer, true)).toBe(held);
		expect(carryOptOutCategories(answer, held, false)).not.toHaveProperty(
			'categories'
		);
		expect(carryOptOutCategories(held, null, false)).toBe(held);
	});
});

describe('answersHeldOptOut (GPC-05)', () => {
	const held: OptOutRecord = {
		categories: ['marketing'],
		heldBy: 'device',
		method: 'gpc',
		recordedAt: NOW - 1000,
		rights: ['sale'],
	};

	it('needs the same time and method, whoever holds the answer', () => {
		const answer: OptOutRecord = { ...held, heldBy: 'both' };
		expect(answersHeldOptOut(answer, held)).toBe(true);
		expect(answersHeldOptOut({ ...held, recordedAt: NOW - 10 }, held)).toBe(
			false
		);
		expect(answersHeldOptOut({ ...held, method: 'button' }, held)).toBe(false);
	});
});
