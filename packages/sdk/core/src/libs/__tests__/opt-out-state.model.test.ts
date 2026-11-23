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
import type { OptOutRecord } from '../../consent-kernel.model';
import {
	isOptedOut,
	resolveCategoryOptOutLock,
	resolveOptOut,
	resolveOptOutReceipt,
	resolveOptOutState,
} from '../opt-out-state.model';

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
					gpcDenyCategories: [],
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

describe('resolveOptOutReceipt', () => {
	test('returns an empty receipt when no opt-out record is held', () => {
		expect(resolveOptOutReceipt(createSnapshot({}))).toEqual({
			at: null,
			optedOut: false,
			reference: null,
			rights: [],
			scope: null,
			source: null,
		});
	});

	test('keeps scope browser and rights empty before backend confirmation, including under local all-three fallback', () => {
		const receipt = resolveOptOutReceipt(
			createSnapshot({
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW,
					rights: ['sale', 'share', 'targeted_ads'],
				},
			}),
			{
				localAct: 'button',
				reference: 'ref-local-1',
				rightsConfirmed: false,
			}
		);
		expect(receipt).toEqual({
			at: NOW,
			optedOut: true,
			reference: 'ref-local-1',
			rights: [],
			scope: 'browser',
			source: 'click',
		});
	});

	test('names confirmed rights and switches scope to account only for person or both', () => {
		const deviceConfirmed = resolveOptOutReceipt(
			createSnapshot({
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			}),
			{
				localAct: 'button',
				reference: 'ref-local-2',
				rightsConfirmed: true,
			}
		);
		expect(deviceConfirmed.scope).toBe('browser');
		expect(deviceConfirmed.source).toBe('click');
		expect(deviceConfirmed.rights).toEqual(['sale', 'share']);

		const bothConfirmed = resolveOptOutReceipt(
			createSnapshot({
				optOut: {
					heldBy: 'both',
					method: 'propagated',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			}),
			{
				localAct: 'button',
				reference: 'ref-local-2',
				rightsConfirmed: true,
			}
		);
		expect(bothConfirmed).toEqual({
			at: NOW,
			optedOut: true,
			reference: 'ref-local-2',
			rights: ['sale', 'share'],
			scope: 'account',
			source: 'click',
		});
	});

	test('never reports click for an account-held record created on another device', () => {
		const fromOtherDevice = resolveOptOutReceipt(
			createSnapshot({
				optOut: {
					heldBy: 'person',
					method: 'button',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			}),
			{
				localAct: null,
				reference: null,
				rightsConfirmed: true,
			}
		);
		expect(fromOtherDevice).toEqual({
			at: NOW,
			optedOut: true,
			reference: null,
			rights: ['sale', 'share'],
			scope: 'account',
			source: 'account',
		});

		const bothWithoutLocalAct = resolveOptOutReceipt(
			createSnapshot({
				optOut: {
					heldBy: 'both',
					method: 'button',
					recordedAt: NOW,
					rights: ['sale', 'targeted_ads'],
				},
			}),
			{
				localAct: null,
				reference: null,
				rightsConfirmed: true,
			}
		);
		expect(bothWithoutLocalAct.source).toBe('account');
		expect(bothWithoutLocalAct.reference).toBeNull();
	});

	test('distinguishes gpc, api, and device-held fallback sources', () => {
		expect(
			resolveOptOutReceipt(
				createSnapshot({
					optOut: {
						heldBy: 'person',
						method: 'api',
						recordedAt: NOW,
						rights: ['sale'],
					},
				}),
				{ localAct: null, reference: null, rightsConfirmed: true }
			).source
		).toBe('api');

		expect(
			resolveOptOutReceipt(
				createSnapshot({
					optOut: {
						heldBy: 'both',
						method: 'propagated',
						recordedAt: NOW,
						rights: ['sale', 'share'],
					},
				}),
				{ localAct: 'gpc', reference: 'ref-gpc', rightsConfirmed: true }
			).source
		).toBe('gpc');

		expect(
			resolveOptOutReceipt(
				createSnapshot({
					optOut: {
						heldBy: 'device',
						method: 'gpc',
						recordedAt: NOW,
						rights: ['sale', 'share'],
					},
				})
			).source
		).toBe('gpc');

		expect(
			resolveOptOutReceipt(
				createSnapshot({
					optOut: {
						heldBy: 'device',
						method: 'button',
						recordedAt: NOW,
						rights: ['sale', 'share'],
					},
				})
			).source
		).toBe('click');
	});
});

describe('resolveOptOut', () => {
	test('merges display state and receipt when not opted out', () => {
		const merged = resolveOptOut(createSnapshot({}));
		expect(merged).toEqual({
			at: null,
			available: true,
			categories: ['marketing', 'measurement'],
			decidingCategory: 'marketing',
			honored: false,
			lock: null,
			optInPromptAllowedAt: null,
			optedOut: false,
			reference: null,
			rights: [],
			scope: null,
			source: null,
			via: null,
		});
		expect(merged.honored).toBe(merged.optedOut);
	});

	test('merges click opt-out with browser scope and local reference', () => {
		const merged = resolveOptOut(
			createSnapshot({
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW,
					rights: ['sale', 'share', 'targeted_ads'],
				},
			}),
			{
				localAct: 'button',
				reference: 'ref-click-1',
				rightsConfirmed: false,
			}
		);
		expect(merged).toEqual({
			at: NOW,
			available: true,
			categories: ['marketing', 'measurement'],
			decidingCategory: 'marketing',
			honored: true,
			lock: null,
			optInPromptAllowedAt: NOW + OPT_OUT_REPROMPT_WAIT_MS,
			optedOut: true,
			reference: 'ref-click-1',
			rights: [],
			scope: 'browser',
			source: 'click',
			via: 'request',
		});
		expect(merged.honored).toBe(merged.optedOut);
	});

	test('merges account-adopted opt-out with account scope and no reference', () => {
		const merged = resolveOptOut(
			createSnapshot({
				optOut: {
					heldBy: 'person',
					method: 'button',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			}),
			{
				localAct: null,
				reference: null,
				rightsConfirmed: true,
			}
		);
		expect(merged).toEqual({
			at: NOW,
			available: true,
			categories: ['marketing', 'measurement'],
			decidingCategory: 'marketing',
			honored: true,
			lock: 'held-by-account',
			optInPromptAllowedAt: NOW + OPT_OUT_REPROMPT_WAIT_MS,
			optedOut: true,
			reference: null,
			rights: ['sale', 'share'],
			scope: 'account',
			source: 'account',
			via: 'request',
		});
		expect(merged.honored).toBe(merged.optedOut);
	});

	test('merges GPC signal opt-out with signal via and gpc source', () => {
		const merged = resolveOptOut(
			createSnapshot({
				gpc: true,
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: NOW,
					rights: ['sale', 'share'],
				},
			}),
			{
				localAct: 'gpc',
				reference: 'ref-gpc-1',
				rightsConfirmed: true,
			}
		);
		expect(merged).toEqual({
			at: NOW,
			available: true,
			categories: ['marketing', 'measurement'],
			decidingCategory: 'marketing',
			honored: true,
			lock: 'gpc-active',
			optInPromptAllowedAt: NOW + OPT_OUT_REPROMPT_WAIT_MS,
			optedOut: true,
			reference: 'ref-gpc-1',
			rights: ['sale', 'share'],
			scope: 'browser',
			source: 'gpc',
			via: 'signal',
		});
		expect(merged.honored).toBe(merged.optedOut);
	});

	test('keeps honored and optedOut equal across policy models and record states', () => {
		const record: OptOutRecord = {
			heldBy: 'device',
			method: 'button',
			recordedAt: NOW,
			rights: ['sale'],
		};
		const cases = [
			createSnapshot({ rule: optOutPolicy }),
			createSnapshot({ optOut: record, rule: optOutPolicy }),
			createSnapshot({ rule: optInRule({ categories: ['marketing'] }) }),
			createSnapshot({
				optOut: record,
				rule: optInRule({ categories: ['marketing'] }),
			}),
			createSnapshot({ rule: noneRule({ categories: ['functionality'] }) }),
			createSnapshot({
				optOut: record,
				rule: noneRule({ categories: ['functionality'] }),
			}),
		];
		for (const snapshot of cases) {
			const merged = resolveOptOut(snapshot);
			expect(merged.honored).toBe(merged.optedOut);
		}
	});
});
