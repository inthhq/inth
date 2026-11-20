import { describe, expect, test } from 'vitest';

import {
	matchedResolution,
	noneRule,
	NOW,
	optInRule,
	optOutRule,
} from '../../__tests__/fixtures/kernel-fixtures';
import { OPT_OUT_REPROMPT_WAIT_MS } from '../../consent-record';
import { createConsentKernel } from '../../kernel';
import type { OptOutRecord } from '../../types';
import { isOptedOut, resolveOptOutState } from '../opt-out-state';

const optOutPolicy = optOutRule({
	categories: ['functionality', 'marketing', 'measurement'],
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
});

const createSnapshot = function createSnapshot(options: {
	rule?: ReturnType<typeof optOutRule>;
	optOut?: OptOutRecord | null;
	gpc?: boolean;
}) {
	const kernel = createConsentKernel({
		initialPolicyResolution: matchedResolution(options.rule ?? optOutPolicy),
		initialPrivacySignals: { gpc: options.gpc ?? false },
		initialRecords:
			options.optOut === undefined ? undefined : { optOut: options.optOut },
		now: NOW,
	});
	return kernel.getSnapshot();
};

describe('resolveOptOutState', () => {
	test('reports available and not honored when no opt-out record is held', () => {
		const state = resolveOptOutState(createSnapshot({}));
		expect(state).toEqual({
			available: true,
			categories: ['marketing', 'measurement'],
			honored: false,
			lock: null,
			optInPromptAllowedAt: null,
			via: null,
		});
	});

	test('reports request honored and unlocked for a button record with GPC off', () => {
		const state = resolveOptOutState(
			createSnapshot({
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(state).toEqual({
			available: true,
			categories: ['marketing', 'measurement'],
			honored: true,
			lock: null,
			optInPromptAllowedAt: NOW + OPT_OUT_REPROMPT_WAIT_MS,
			via: 'request',
		});
	});

	test('reports signal honored and gpc-active lock for a gpc record with GPC on', () => {
		const state = resolveOptOutState(
			createSnapshot({
				gpc: true,
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(state).toEqual({
			available: true,
			categories: ['marketing', 'measurement'],
			honored: true,
			lock: 'gpc-active',
			optInPromptAllowedAt: NOW + OPT_OUT_REPROMPT_WAIT_MS,
			via: 'signal',
		});
	});

	test('reports signal honored and unlocked for a gpc record after GPC turns off', () => {
		const state = resolveOptOutState(
			createSnapshot({
				gpc: false,
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(state).toEqual({
			available: true,
			categories: ['marketing', 'measurement'],
			honored: true,
			lock: null,
			optInPromptAllowedAt: NOW + OPT_OUT_REPROMPT_WAIT_MS,
			via: 'signal',
		});
	});

	test('reports signal via and gpc-active lock when GPC is active over a button record', () => {
		const state = resolveOptOutState(
			createSnapshot({
				gpc: true,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(state.via).toBe('signal');
		expect(state.lock).toBe('gpc-active');
	});

	test.each(['person', 'both'] as const)(
		'reports held-by-account lock for heldBy=%s when GPC is off',
		(heldBy) => {
			const state = resolveOptOutState(
				createSnapshot({
					gpc: false,
					optOut: {
						heldBy,
						method: 'button',
						recordedAt: NOW,
						rights: ['sale', 'share'],
					},
				})
			);
			expect(state).toEqual({
				available: true,
				categories: ['marketing', 'measurement'],
				honored: true,
				lock: 'held-by-account',
				optInPromptAllowedAt: NOW + OPT_OUT_REPROMPT_WAIT_MS,
				via: 'request',
			});
		}
	);

	test('reports gpc-active ahead of held-by-account when both apply', () => {
		const state = resolveOptOutState(
			createSnapshot({
				gpc: true,
				optOut: {
					heldBy: 'person',
					method: 'button',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			})
		);
		expect(state.lock).toBe('gpc-active');
		expect(state.via).toBe('signal');
	});

	test('reports unavailable under opt-in and none rules, while still reflecting a held record', () => {
		const optIn = resolveOptOutState(
			createSnapshot({
				rule: optInRule({ categories: ['marketing'] }),
			})
		);
		expect(optIn).toEqual({
			available: false,
			categories: ['marketing'],
			honored: false,
			lock: null,
			optInPromptAllowedAt: null,
			via: null,
		});

		const optInWithRecord = resolveOptOutState(
			createSnapshot({
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: NOW,
					rights: ['sale'],
				},
				rule: optInRule({ categories: ['marketing'] }),
			})
		);
		expect(optInWithRecord).toEqual({
			available: false,
			categories: ['marketing'],
			honored: true,
			lock: null,
			optInPromptAllowedAt: NOW + OPT_OUT_REPROMPT_WAIT_MS,
			via: 'signal',
		});

		const none = resolveOptOutState(
			createSnapshot({
				rule: noneRule({ categories: ['functionality'] }),
			})
		);
		expect(none).toEqual({
			available: false,
			categories: [],
			honored: false,
			lock: null,
			optInPromptAllowedAt: null,
			via: null,
		});
	});
});

describe('isOptedOut', () => {
	const heldRecord: OptOutRecord = {
		heldBy: 'device',
		method: 'button',
		recordedAt: NOW,
		rights: ['sale', 'share', 'targeted_ads'],
	};

	test('returns false with no record when marketing and measurement are granted', () => {
		expect(isOptedOut(createSnapshot({}))).toBe(false);
	});

	test('returns true when an opt-out record is held, even when effective permissions are granted', () => {
		expect(isOptedOut(createSnapshot({ optOut: heldRecord }))).toBe(true);
		expect(
			isOptedOut({
				effectivePermissions: {
					experience: true,
					functionality: true,
					marketing: true,
					measurement: true,
					necessary: true,
				},
				evaluationPolicy: {
					scope: ['functionality', 'marketing', 'measurement'],
				},
				optOut: heldRecord,
			})
		).toBe(true);
	});

	test('returns true with no record when marketing is denied', () => {
		const base = createSnapshot({});
		expect(
			isOptedOut({
				...base,
				effectivePermissions: {
					...base.effectivePermissions,
					marketing: false,
					measurement: true,
				},
			})
		).toBe(true);
	});

	test('returns true with no record when measurement is denied', () => {
		const base = createSnapshot({});
		expect(
			isOptedOut({
				...base,
				effectivePermissions: {
					...base.effectivePermissions,
					marketing: true,
					measurement: false,
				},
			})
		).toBe(true);
	});

	test('returns false with no record when the rule scope has neither marketing nor measurement', () => {
		const snapshot = createSnapshot({
			rule: optOutRule({ categories: ['functionality'] }),
		});
		expect(
			isOptedOut({
				...snapshot,
				effectivePermissions: {
					...snapshot.effectivePermissions,
					marketing: false,
					measurement: false,
				},
			})
		).toBe(false);
		expect(
			isOptedOut(
				createSnapshot({
					optOut: heldRecord,
					rule: optOutRule({ categories: ['functionality'] }),
				})
			)
		).toBe(true);
	});

	test('honors a categories override without a record, while a held record always returns true', () => {
		const base = createSnapshot({});
		const marketingDenied = {
			...base,
			effectivePermissions: {
				...base.effectivePermissions,
				marketing: false,
				measurement: true,
			},
		};
		expect(isOptedOut(marketingDenied, ['measurement'])).toBe(false);
		expect(isOptedOut(marketingDenied, [])).toBe(false);
		expect(isOptedOut({ ...marketingDenied, optOut: heldRecord }, [])).toBe(
			true
		);
		expect(isOptedOut({ ...base, optOut: heldRecord }, ['functionality'])).toBe(
			true
		);
	});
});
