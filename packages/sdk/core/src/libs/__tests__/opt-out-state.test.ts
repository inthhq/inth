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
import {
	isOptedOut,
	resolveCategoryOptOutLock,
	resolveOptOutState,
} from '../opt-out-state';

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
			decidingCategory: 'marketing',
			honored: false,
			lock: null,
			optInPromptAllowedAt: null,
			via: null,
		});
	});

	test('reports measurement as decidingCategory when marketing is not in scope', () => {
		const state = resolveOptOutState(
			createSnapshot({
				rule: optOutRule({ categories: ['functionality', 'measurement'] }),
			})
		);
		expect(state.categories).toEqual(['measurement']);
		expect(state.decidingCategory).toBe('measurement');
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
			decidingCategory: 'marketing',
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
			decidingCategory: 'marketing',
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
			decidingCategory: 'marketing',
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
				decidingCategory: 'marketing',
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
			decidingCategory: 'marketing',
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
			decidingCategory: 'marketing',
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
			decidingCategory: null,
			honored: false,
			lock: null,
			optInPromptAllowedAt: null,
			via: null,
		});
	});
});

describe('resolveCategoryOptOutLock', () => {
	test('locks marketing and leaves measurement usable when GPC maps only marketing', () => {
		const snapshot = createSnapshot({
			gpc: true,
			optOut: {
				heldBy: 'device',
				method: 'gpc',
				recordedAt: NOW,
				rights: ['sale', 'share'],
			},
			rule: optOutRule({
				categories: ['functionality', 'marketing', 'measurement'],
				privacySignals: { gpc: { denyCategories: ['marketing'] } },
			}),
		});
		expect(resolveCategoryOptOutLock(snapshot, 'necessary')).toBeNull();
		expect(resolveCategoryOptOutLock(snapshot, 'functionality')).toBeNull();
		expect(resolveCategoryOptOutLock(snapshot, 'marketing')).toBe('gpc-active');
		expect(resolveCategoryOptOutLock(snapshot, 'measurement')).toBeNull();
	});

	test('locks every category carrying a live gpc restriction', () => {
		const snapshot = createSnapshot({
			gpc: true,
			optOut: {
				heldBy: 'device',
				method: 'gpc',
				recordedAt: NOW,
				rights: ['sale', 'share'],
			},
		});
		expect(resolveCategoryOptOutLock(snapshot, 'marketing')).toBe('gpc-active');
		expect(resolveCategoryOptOutLock(snapshot, 'measurement')).toBe(
			'gpc-active'
		);
		expect(resolveCategoryOptOutLock(snapshot, 'functionality')).toBeNull();
	});

	test('annotates only the deciding category for an account-held opt-out when GPC is off', () => {
		const snapshot = createSnapshot({
			gpc: false,
			optOut: {
				heldBy: 'person',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale', 'share'],
			},
		});
		expect(resolveCategoryOptOutLock(snapshot, 'marketing')).toBe(
			'held-by-account'
		);
		expect(resolveCategoryOptOutLock(snapshot, 'measurement')).toBeNull();
		expect(resolveCategoryOptOutLock(snapshot, 'functionality')).toBeNull();

		const measurementOnly = createSnapshot({
			gpc: false,
			optOut: {
				heldBy: 'both',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale', 'share'],
			},
			rule: optOutRule({ categories: ['functionality', 'measurement'] }),
		});
		expect(resolveCategoryOptOutLock(measurementOnly, 'measurement')).toBe(
			'held-by-account'
		);
		expect(resolveCategoryOptOutLock(measurementOnly, 'marketing')).toBeNull();
	});

	test('returns null for a device-held request opt-out when GPC is off', () => {
		const snapshot = createSnapshot({
			gpc: false,
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale', 'share'],
			},
		});
		expect(resolveCategoryOptOutLock(snapshot, 'marketing')).toBeNull();
		expect(resolveCategoryOptOutLock(snapshot, 'measurement')).toBeNull();
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

	test('returns false with no record when only measurement is denied while marketing is in scope and permitted', () => {
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
		).toBe(false);
	});

	test('checks measurement when marketing is not in scope', () => {
		const base = createSnapshot({
			rule: optOutRule({ categories: ['functionality', 'measurement'] }),
		});
		expect(
			isOptedOut({
				...base,
				effectivePermissions: {
					...base.effectivePermissions,
					measurement: false,
				},
			})
		).toBe(true);
		expect(
			isOptedOut({
				...base,
				effectivePermissions: {
					...base.effectivePermissions,
					measurement: true,
				},
			})
		).toBe(false);
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
