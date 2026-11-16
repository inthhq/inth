/**
 * A plain script the stand-in starts without the engine must run under
 * exactly the conditions the loader would. `isRunnableNow` keeps its own
 * small evaluator, so the first load does not carry `has`; this table keeps
 * the two from drifting by running every condition form through both.
 */
import { describe, expect, test } from 'vitest';

import type { AllConsentNames } from '../../consent/consent-types';
import { has } from '../../libs/has';
import type { HasCondition } from '../../libs/has';
import { isRunnableNow } from '../plain-scripts';

const permissions = {
	experience: false,
	functionality: false,
	marketing: true,
	measurement: false,
	necessary: true,
};

/** What the loader decides: `has`, with a condition it rejects as `false`. */
const canonical = (condition: unknown): boolean => {
	try {
		return has(condition as HasCondition<AllConsentNames>, permissions);
	} catch {
		return false;
	}
};

const conditions: [string, unknown][] = [
	['a granted category', 'marketing'],
	['a denied category', 'measurement'],
	['an unknown category', 'unknown'],
	['an empty AND', { and: [] }],
	['an empty OR', { or: [] }],
	['an AND of one granted', { and: ['marketing'] }],
	['an AND with a denied part', { and: ['marketing', 'measurement'] }],
	['an AND of a single condition', { and: 'marketing' }],
	['an OR with a granted part', { or: ['measurement', 'marketing'] }],
	['an OR of denied parts', { or: ['measurement', 'functionality'] }],
	['an OR of a single condition', { or: 'measurement' }],
	['a NOT of a denied category', { not: 'measurement' }],
	['a NOT of a granted category', { not: 'marketing' }],
	['a NOT of an empty AND', { not: { and: [] } }],
	['a NOT of an empty OR', { not: { or: [] } }],
	['a NOT of an unknown category', { not: 'unknown' }],
	[
		'a nested condition',
		{
			and: [
				'necessary',
				{ or: ['measurement', 'marketing'] },
				{ not: 'functionality' },
			],
		},
	],
	['an AND containing an empty OR', { and: ['marketing', { or: [] }] }],
	['a bare array', ['marketing']],
	['an empty object', {}],
	['an object with another key', { xor: ['marketing'] }],
	['null', null],
	['a NOT of a bare array', { not: ['marketing'] }],
	['a NOT of null', { not: null }],
	['an OR containing an empty AND', { or: ['marketing', { and: [] }] }],
];

describe('isRunnableNow and the canonical evaluator', () => {
	test.each(conditions)('agree on %s', (_name, category) => {
		expect(
			isRunnableNow(
				{ category: category as HasCondition<AllConsentNames> },
				{ effectivePermissions: permissions }
			)
		).toBe(canonical(category));
	});

	test('reject an empty AND, as the loader does', () => {
		expect(
			isRunnableNow(
				{ category: { and: [] } as unknown as HasCondition<AllConsentNames> },
				{ effectivePermissions: permissions }
			)
		).toBe(false);
	});
});
