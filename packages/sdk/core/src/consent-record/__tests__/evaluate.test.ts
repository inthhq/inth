import type { OptOutRecord } from '@inth/sdk-schema/types';
import { describe, expect, it } from 'vitest';

import {
	evaluateConsentRecord,
	OPT_OUT_REPROMPT_WAIT_MS,
	optInPromptAllowedAt,
} from '../evaluate';
import { normalizeLegacyConsentRecord } from '../normalize';
import type { ExplicitChoice, NoticeDismissal } from '../types';
import { validateOptOutRecord } from '../validation';
import { currentBasis, DAY, makeChoice, makePolicy, NOW } from './fixtures';

const allFalse = {
	experience: false,
	functionality: false,
	marketing: false,
	measurement: false,
	necessary: true,
};
const allTrue = {
	experience: true,
	functionality: true,
	marketing: true,
	measurement: true,
	necessary: true,
};

describe('evaluateConsentRecord: fresh subjects', () => {
	it('denies optional categories and requires a choice under opt-in', () => {
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy(),
		});
		expect(result.permissions).toEqual(allFalse);
		expect(result.restrictions).toEqual({});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
		expect(result.nextDeadline).toBeNull();
	});

	it('follows the model default and the configured prompt under opt-out', () => {
		for (const prompt of ['choice', 'notice', 'none'] as const) {
			const result = evaluateConsentRecord({
				choice: null,
				noticeDismissal: null,
				now: NOW,
				policy: makePolicy({ model: 'opt-out', prompt }),
			});
			expect(result.permissions).toEqual(allTrue);
			expect(result.promptRequirement).toEqual(
				prompt === 'none'
					? { kind: 'none' }
					: { kind: prompt, reason: 'missing' }
			);
		}
	});

	it('treats an IAB policy like opt-in for category defaults', () => {
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({ model: 'iab' }),
		});
		expect(result.permissions).toEqual(allFalse);
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
	});

	it('still asks under a choice prompt when the policy governs no optional category', () => {
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({ scope: [], scopeMode: 'strict' }),
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
		expect(result.permissions).toEqual(allFalse);
	});
});

describe('evaluateConsentRecord: legacy records', () => {
	const legacyRecord = {
		consentInfo: { subjectId: 'sub_2VZxR7YmNpKq3WfLs8TgHd', time: NOW - DAY },
		consents: {
			experience: false,
			functionality: true,
			marketing: true,
			measurement: false,
			necessary: true,
		},
	};

	const normalize = function normalize(fingerprint?: string) {
		const result = normalizeLegacyConsentRecord(
			{
				...legacyRecord,
				consentInfo: {
					...legacyRecord.consentInfo,
					materialPolicyFingerprint: fingerprint,
				},
			},
			{ encoding: 'json', now: NOW }
		);
		if (result.ok === false) {
			throw new Error('fixture must normalize');
		}
		return result.choice;
	};

	it('keeps a valid record without a material hash current and complete', () => {
		const result = evaluateConsentRecord({
			choice: normalize(),
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({ legacyMaterialFingerprint: 'material-a' }),
		});
		expect(result.permissions).toEqual({
			...allFalse,
			functionality: true,
			marketing: true,
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
	});

	it('keeps a matching material hash current', () => {
		const result = evaluateConsentRecord({
			choice: normalize('material-a'),
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({ legacyMaterialFingerprint: 'material-a' }),
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
		expect(result.permissions.marketing).toBe(true);
	});

	it('grandfathers a legacy hash when resolution cannot supply a comparable one', () => {
		const result = evaluateConsentRecord({
			choice: normalize('material-a'),
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({ legacyMaterialFingerprint: null }),
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
	});

	it('stops positive authority on a known material mismatch but keeps denials', () => {
		const result = evaluateConsentRecord({
			choice: normalize('material-a'),
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({ legacyMaterialFingerprint: 'material-b' }),
		});
		expect(result.permissions).toEqual(allFalse);
		expect(result.categories.marketing.authority).toBe('policy-changed');
		expect(result.restrictions).toEqual({
			experience: ['explicit-denial'],
			measurement: ['explicit-denial'],
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
	});

	it('never compares a legacy hash to the choice prompt fingerprint', () => {
		const policy = makePolicy();
		const choice = normalize(policy.choice.fingerprint);
		const result = evaluateConsentRecord({
			choice,
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({ legacyMaterialFingerprint: 'material-b' }),
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
		expect(result.categories.marketing.authority).toBe('policy-changed');
		expect(result.permissions.marketing).toBe(false);
	});
});

describe('evaluateConsentRecord: per-category grant expiry', () => {
	const policy = makePolicy({
		choice: { fingerprint: 'choice-fp-1', maxAgeMs: 30 * DAY },
	});
	const basis = currentBasis(policy);
	const choice: ExplicitChoice = {
		categories: {
			experience: { basis, confirmedAt: NOW, value: false },
			functionality: { basis, confirmedAt: NOW, value: false },
			marketing: { basis, confirmedAt: NOW, value: true },
			measurement: { basis, confirmedAt: NOW + 29 * DAY, value: true },
		},
		version: 3,
	};

	it('expires each grant on its own confirmation time', () => {
		const atDay30 = evaluateConsentRecord({
			choice,
			noticeDismissal: null,
			now: NOW + 30 * DAY,
			policy,
		});
		expect(atDay30.permissions.marketing).toBe(false);
		expect(atDay30.permissions.measurement).toBe(true);
		expect(atDay30.categories.marketing.authority).toBe('expired');
		expect(atDay30.promptRequirement).toEqual({ kind: 'none' });
		expect(atDay30.nextDeadline).toBe(NOW + 59 * DAY);

		const atDay59 = evaluateConsentRecord({
			choice,
			noticeDismissal: null,
			now: NOW + 59 * DAY,
			policy,
		});
		expect(atDay59.permissions.measurement).toBe(false);
		expect(atDay59.nextDeadline).toBeNull();
	});

	it('flips exactly at the deadline under opt-in', () => {
		const expiresAt = NOW + 30 * DAY;
		const permitted = (now: number) =>
			evaluateConsentRecord({ choice, noticeDismissal: null, now, policy })
				.permissions.marketing;
		expect(permitted(expiresAt - 1)).toBe(true);
		expect(permitted(expiresAt)).toBe(false);
		expect(permitted(expiresAt + 1)).toBe(false);
	});

	it('keeps the permission expiry deadline while required coverage is missing', () => {
		const partial: ExplicitChoice = {
			categories: { marketing: { basis, confirmedAt: NOW, value: true } },
			version: 3,
		};
		const result = evaluateConsentRecord({
			choice: partial,
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
		expect(result.nextDeadline).toBe(NOW + 30 * DAY);
	});

	it('falls back to the opt-out default at expiry without touching the raw choice', () => {
		const optOut = makePolicy({
			choice: { fingerprint: 'choice-fp-1', maxAgeMs: 30 * DAY },
			model: 'opt-out',
		});
		const optOutChoice = makeChoice(
			{ marketing: true },
			NOW,
			currentBasis(optOut)
		);
		const frozen = JSON.stringify(optOutChoice);
		const result = evaluateConsentRecord({
			choice: optOutChoice,
			noticeDismissal: null,
			now: NOW + 30 * DAY,
			policy: optOut,
		});
		expect(result.permissions.marketing).toBe(true);
		expect(result.categories.marketing.source).toBe('default');
		expect(result.categories.marketing.authority).toBe('expired');
		expect(JSON.stringify(optOutChoice)).toBe(frozen);
	});

	it('does not schedule a deadline that cannot change anything', () => {
		const optOutNone = makePolicy({
			choice: { fingerprint: 'choice-fp-1', maxAgeMs: 30 * DAY },
			model: 'opt-out',
			prompt: 'none',
		});
		const result = evaluateConsentRecord({
			choice: makeChoice({ marketing: true }, NOW, currentBasis(optOutNone)),
			noticeDismissal: null,
			now: NOW,
			policy: optOutNone,
		});
		expect(result.nextDeadline).toBeNull();
	});
});

describe('evaluateConsentRecord: denials', () => {
	it('does not re-prompt an aged full rejection and keeps every denial', () => {
		const policy = makePolicy({
			choice: { fingerprint: 'choice-fp-1', maxAgeMs: 30 * DAY },
		});
		const result = evaluateConsentRecord({
			choice: makeChoice(
				{
					experience: false,
					functionality: false,
					marketing: false,
					measurement: false,
				},
				NOW - 400 * DAY,
				currentBasis(policy)
			),
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
		expect(result.permissions).toEqual(allFalse);
		expect(Object.keys(result.restrictions)).toHaveLength(4);
	});

	it('keeps a full rejection without re-prompting after a material change', () => {
		const before = makePolicy();
		const after = makePolicy({
			choice: { fingerprint: 'choice-fp-2', maxAgeMs: null },
			model: 'opt-out',
		});
		const result = evaluateConsentRecord({
			choice: makeChoice(
				{
					experience: false,
					functionality: false,
					marketing: false,
					measurement: false,
				},
				NOW,
				currentBasis(before)
			),
			noticeDismissal: null,
			now: NOW,
			policy: after,
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
		expect(result.permissions).toEqual(allFalse);
	});

	it.each(['changed', 'expired', 'new-category'] as const)(
		'does not use a %s grant to ask for reversal of another category refusal',
		(change) => {
			const before = makePolicy({ scope: ['marketing', 'measurement'] });
			const choice = makeChoice(
				{ marketing: false, measurement: true },
				NOW,
				currentBasis(before)
			);
			const policy = makePolicy({
				choice: {
					fingerprint: change === 'changed' ? 'new' : before.choice.fingerprint,
					maxAgeMs: 30 * DAY,
				},
				scope:
					change === 'new-category'
						? ['marketing', 'measurement', 'functionality']
						: before.scope,
			});
			const result = evaluateConsentRecord({
				choice,
				noticeDismissal: null,
				now: change === 'expired' ? NOW + 31 * DAY : NOW,
				policy,
			});
			expect(result.promptRequirement).toEqual({ kind: 'none' });
			expect(result.permissions.marketing).toBe(false);
			expect(result.permissions.measurement).toBe(change === 'new-category');
			expect(result.permissions.functionality).toBe(change !== 'new-category');
		}
	);

	it('still requests a fresh choice after all grants become incompatible', () => {
		const before = makePolicy();
		const result = evaluateConsentRecord({
			choice: makeChoice(
				{
					experience: true,
					functionality: true,
					marketing: true,
					measurement: true,
				},
				NOW,
				currentBasis(before)
			),
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({
				choice: { fingerprint: 'changed', maxAgeMs: null },
			}),
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'policy-changed',
		});
		expect(result.permissions).toEqual(allFalse);
	});

	it('does not let a refusal outside the requested scope hide a new choice', () => {
		const policy = makePolicy({ scope: ['measurement'] });
		const result = evaluateConsentRecord({
			choice: makeChoice({ marketing: false }, NOW, currentBasis(policy)),
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
		expect(result.permissions.marketing).toBe(false);
	});

	it('reports missing when the confirmed keys are fresh but incomplete', () => {
		const policy = makePolicy();
		const result = evaluateConsentRecord({
			choice: makeChoice({ marketing: true }, NOW, currentBasis(policy)),
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
		expect(result.permissions.marketing).toBe(true);
	});
});

describe('evaluateConsentRecord: scope', () => {
	it('denies a strict excluded category despite a stored grant', () => {
		const policy = makePolicy({
			model: 'opt-out',
			scope: ['functionality'],
			scopeMode: 'strict',
		});
		const result = evaluateConsentRecord({
			choice: makeChoice({ marketing: true }, NOW, currentBasis(policy)),
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.permissions.marketing).toBe(false);
		expect(result.restrictions.marketing).toEqual(['strict-scope']);
		expect(result.categories.marketing.inScope).toBe(false);
	});

	it('lets a permissive excluded category default to allowed but never overrides a denial', () => {
		const policy = makePolicy({
			scope: ['functionality'],
			scopeMode: 'permissive',
		});
		const result = evaluateConsentRecord({
			choice: makeChoice({ marketing: false }, NOW, currentBasis(policy)),
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.permissions.measurement).toBe(true);
		expect(result.categories.measurement.source).toBe('default');
		expect(result.permissions.marketing).toBe(false);
		expect(result.restrictions.marketing).toEqual(['explicit-denial']);
	});

	it('does not require a choice for categories outside scope', () => {
		const policy = makePolicy({ scope: ['functionality'] });
		const result = evaluateConsentRecord({
			choice: makeChoice({ functionality: true }, NOW, currentBasis(policy)),
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
	});
});

describe('evaluateConsentRecord: privacy signals', () => {
	const policy = makePolicy({
		gpcDenyCategories: ['marketing', 'measurement'],
		model: 'opt-out',
	});

	it('masks an ordinary stored grant under an applicable signal', () => {
		const result = evaluateConsentRecord({
			choice: makeChoice(
				{ functionality: true, marketing: true, measurement: true },
				NOW,
				currentBasis(policy)
			),
			gpc: true,
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.permissions).toEqual({
			...allTrue,
			marketing: false,
			measurement: false,
		});
		expect(result.restrictions).toEqual({
			marketing: ['gpc'],
			measurement: ['gpc'],
		});
		expect(result.categories.marketing.authority).toBe('valid');
	});

	it('ignores the signal when the policy has no mapping', () => {
		const result = evaluateConsentRecord({
			choice: null,
			gpc: true,
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({ model: 'opt-out' }),
		});
		expect(result.permissions).toEqual(allTrue);
		expect(result.restrictions).toEqual({});
	});

	it('does not acknowledge a required notice', () => {
		const notice = makePolicy({
			gpcDenyCategories: ['marketing'],
			model: 'opt-out',
			prompt: 'notice',
		});
		const result = evaluateConsentRecord({
			choice: null,
			gpc: true,
			noticeDismissal: null,
			now: NOW,
			policy: notice,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'notice',
			reason: 'missing',
		});
	});
});

describe('evaluateConsentRecord: notices', () => {
	it('acknowledging a notice preserves denials and never creates a choice', () => {
		const policy = makePolicy({ model: 'opt-out', prompt: 'notice' });
		const choice = makeChoice({ marketing: false }, NOW, currentBasis(policy));
		for (const noticeDismissal of [
			null,
			{
				dismissedAt: NOW,
				fingerprint: policy.notice.fingerprint,
				version: 1 as const,
			},
		]) {
			const result = evaluateConsentRecord({
				choice,
				noticeDismissal,
				now: NOW,
				policy,
			});
			expect(result.permissions.marketing).toBe(false);
			expect(result.promptRequirement.kind).toBe(
				noticeDismissal ? 'none' : 'notice'
			);
		}
	});
	const policy = makePolicy({
		choice: { fingerprint: 'choice-fp-1', maxAgeMs: 10 * DAY },
		model: 'opt-out',
		notice: { fingerprint: 'notice-fp-1', maxAgeMs: 30 * DAY },
		prompt: 'notice',
	});
	const dismissal: NoticeDismissal = {
		dismissedAt: NOW,
		fingerprint: policy.notice.fingerprint,
		version: 1,
	};

	it('stays dismissed through category expiry and partial saves', () => {
		const choice = makeChoice({ marketing: true }, NOW, currentBasis(policy));
		const afterExpiry = evaluateConsentRecord({
			choice,
			noticeDismissal: dismissal,
			now: NOW + 11 * DAY,
			policy,
		});
		expect(afterExpiry.promptRequirement).toEqual({ kind: 'none' });
		expect(afterExpiry.nextDeadline).toBe(NOW + 30 * DAY);

		const withoutChoice = evaluateConsentRecord({
			choice: null,
			noticeDismissal: dismissal,
			now: NOW,
			policy,
		});
		expect(withoutChoice.promptRequirement).toEqual({ kind: 'none' });
		expect(withoutChoice.permissions).toEqual(allTrue);
	});

	it('returns as expired exactly at its own deadline', () => {
		const at = (now: number) =>
			evaluateConsentRecord({
				choice: null,
				noticeDismissal: dismissal,
				now,
				policy,
			}).promptRequirement;
		expect(at(NOW + 30 * DAY - 1)).toEqual({ kind: 'none' });
		expect(at(NOW + 30 * DAY)).toEqual({ kind: 'notice', reason: 'expired' });
	});

	it('reports policy-changed for a dismissal of a different notice', () => {
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: { ...dismissal, fingerprint: 'other-notice' },
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'notice',
			reason: 'policy-changed',
		});
		expect(result.nextDeadline).toBeNull();
	});

	it('never lets a dismissal satisfy a choice prompt', () => {
		const choicePolicy = makePolicy({ model: 'opt-out' });
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: {
				dismissedAt: NOW,
				fingerprint: choicePolicy.notice.fingerprint,
				version: 1,
			},
			now: NOW,
			policy: choicePolicy,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
	});

	it('does not clear a notice requirement from a choice alone; the kernel records the dismissal with the save', () => {
		const result = evaluateConsentRecord({
			choice: makeChoice(
				{
					experience: true,
					functionality: true,
					marketing: false,
					measurement: false,
				},
				NOW,
				currentBasis(policy)
			),
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'notice',
			reason: 'missing',
		});
		expect(result.permissions.marketing).toBe(false);
	});
});

describe('evaluateConsentRecord: determinism', () => {
	it('returns equal results for equal inputs', () => {
		const policy = makePolicy({
			choice: { fingerprint: 'choice-fp-1', maxAgeMs: 30 * DAY },
		});
		const input = {
			choice: makeChoice({ marketing: true }, NOW - DAY, currentBasis(policy)),
			gpc: true,
			noticeDismissal: null,
			now: NOW,
			policy,
		};
		expect(evaluateConsentRecord(input)).toEqual(evaluateConsentRecord(input));
	});
});

describe('evaluateConsentRecord: meaningful deadlines', () => {
	const policy = makePolicy({
		choice: { fingerprint: 'current', maxAgeMs: 30 },
		gpcDenyCategories: ['marketing'],
		model: 'opt-out',
		scope: ['marketing', 'measurement'],
	});

	it.each(['missing', 'policy-changed', 'expired'] as const)(
		'ignores later opt-out expiry when the prompt remains %s',
		(reason) => {
			const choice = makeChoice({ marketing: true }, NOW, currentBasis(policy));
			if (reason !== 'missing') {
				choice.categories.measurement = {
					basis: {
						fingerprint: reason === 'policy-changed' ? 'old' : 'current',
						kind: 'choice-v1',
					},
					confirmedAt: NOW - 30,
					value: true,
				};
			}
			const at = (now: number) =>
				evaluateConsentRecord({
					choice,
					noticeDismissal: null,
					now,
					policy,
				});
			expect(at(NOW).promptRequirement).toEqual({ kind: 'choice', reason });
			expect(at(NOW).nextDeadline).toBeNull();
			expect(at(NOW + 30).permissions).toEqual(at(NOW).permissions);
			expect(at(NOW + 30).promptRequirement).toEqual(at(NOW).promptRequirement);
		}
	);

	it('does not schedule opt-out expiry that cannot change permissions or a refused prompt', () => {
		const choice = makeChoice(
			{ marketing: true, measurement: false },
			NOW,
			currentBasis(policy)
		);
		const at = (now: number) =>
			evaluateConsentRecord({
				choice,
				gpc: true,
				noticeDismissal: null,
				now,
				policy,
			});
		expect(at(NOW).promptRequirement).toEqual({ kind: 'none' });
		expect(at(NOW).nextDeadline).toBeNull();
		expect(at(NOW + 30).promptRequirement).toEqual({ kind: 'none' });
	});

	it.each(['opt-in', 'iab'] as const)(
		'ignores masked %s expiry while coverage stays missing',
		(model) => {
			const choice = makeChoice({ marketing: true }, NOW, currentBasis(policy));
			const evaluation = evaluateConsentRecord({
				choice,
				gpc: true,
				noticeDismissal: null,
				now: NOW,
				policy: { ...policy, model },
			});
			expect(evaluation.permissions.marketing).toBe(false);
			expect(evaluation.nextDeadline).toBeNull();
		}
	);

	it('skips an earlier masked grant and schedules the first permission change', () => {
		const choice = makeChoice({ marketing: true }, NOW, currentBasis(policy));
		choice.categories.measurement = {
			basis: currentBasis(policy),
			confirmedAt: NOW + 10,
			value: true,
		};
		const scoped = makePolicy({
			choice: policy.choice,
			gpcDenyCategories: ['marketing'],
			scope: ['marketing', 'measurement', 'functionality'],
		});
		const evaluation = evaluateConsentRecord({
			choice,
			gpc: true,
			noticeDismissal: null,
			now: NOW + 10,
			policy: scoped,
		});
		expect(evaluation.promptRequirement).toEqual({ kind: 'none' });
		expect(evaluation.nextDeadline).toBe(NOW + 40);
	});
});

describe('evaluateConsentRecord: the none model', () => {
	it('grants in-scope categories, owes no prompt and ignores GPC unless mapped', () => {
		const policy = makePolicy({ model: 'none', prompt: 'none' });
		const fresh = evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(fresh.permissions).toEqual(allTrue);
		expect(fresh.promptRequirement).toEqual({ kind: 'none' });
		expect(fresh.nextDeadline).toBeNull();
		const signalled = evaluateConsentRecord({
			choice: null,
			gpc: true,
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(signalled.permissions).toEqual(allTrue);
		const mapped = evaluateConsentRecord({
			choice: null,
			gpc: true,
			noticeDismissal: null,
			now: NOW,
			policy: makePolicy({
				gpcDenyCategories: ['marketing'],
				model: 'none',
				prompt: 'none',
			}),
		});
		expect(mapped.permissions).toEqual({
			...allTrue,
			marketing: false,
		});
	});

	it('requires the none prompt', () => {
		expect(() => makePolicy({ model: 'none', prompt: 'choice' })).toThrow(
			/requires prompt "none"/u
		);
	});
});

describe('evaluateConsentRecord: displayed choice scope', () => {
	it('ignores hidden missing decisions and refusals when requiring a displayed choice', () => {
		const policy = makePolicy({ choiceScope: ['measurement'] });
		const choice = makeChoice({ marketing: false }, NOW, currentBasis(policy));
		const result = evaluateConsentRecord({
			choice,
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
		expect(result.permissions.marketing).toBe(false);
	});

	it('keeps opt-in expiry deadlines for hidden grants without reopening the prompt', () => {
		const policy = makePolicy({
			choice: { fingerprint: 'fp', maxAgeMs: DAY },
			choiceScope: ['measurement'],
		});
		const choice = makeChoice(
			{ marketing: true },
			NOW - DAY + 1000,
			currentBasis(policy)
		);
		choice.categories.measurement = {
			basis: currentBasis(policy),
			confirmedAt: NOW,
			value: true,
		};
		const input = { choice, noticeDismissal: null, now: NOW, policy };
		const result = evaluateConsentRecord(input);
		expect(result.promptRequirement).toEqual({ kind: 'none' });
		expect(result.nextDeadline).toBe(NOW + 1000);
		const expired = evaluateConsentRecord({ ...input, now: NOW + 1000 });
		expect(expired.permissions.marketing).toBe(false);
		expect(expired.promptRequirement).toEqual({ kind: 'none' });
		expect(expired.nextDeadline).toBe(NOW + DAY);
		expect(
			evaluateConsentRecord({ ...input, now: NOW + DAY }).promptRequirement
		).toEqual({ kind: 'choice', reason: 'expired' });
	});

	it('does not schedule irrelevant hidden opt-out grant expiry', () => {
		const policy = makePolicy({
			choice: { fingerprint: 'fp', maxAgeMs: DAY },
			choiceScope: ['measurement'],
			model: 'opt-out',
		});
		const choice = makeChoice(
			{ marketing: true },
			NOW - DAY + 1000,
			currentBasis(policy)
		);
		choice.categories.measurement = {
			basis: currentBasis(policy),
			confirmedAt: NOW,
			value: true,
		};
		const result = evaluateConsentRecord({
			choice,
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
		expect(result.nextDeadline).toBe(NOW + DAY);
	});
});

describe('evaluateConsentRecord: empty choice scope', () => {
	const policy = makePolicy({
		choice: { fingerprint: 'choice-fp-1', maxAgeMs: DAY },
		choiceScope: [],
	});
	const acknowledgement = (
		dismissedAt: number,
		fingerprint = policy.choice.fingerprint
	): NoticeDismissal => ({ dismissedAt, fingerprint, version: 1 });

	it('asks for an acknowledgement until the visitor gives one', () => {
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
		expect(result.permissions).toEqual(allFalse);
	});

	it('is answered by an acknowledgement until the choice lifetime ends', () => {
		const input = {
			choice: null,
			noticeDismissal: acknowledgement(NOW - 1000),
			now: NOW,
			policy,
		};
		const result = evaluateConsentRecord(input);
		expect(result.promptRequirement).toEqual({ kind: 'none' });
		expect(result.nextDeadline).toBe(NOW - 1000 + DAY);
		expect(
			evaluateConsentRecord({ ...input, now: NOW - 1000 + DAY })
				.promptRequirement
		).toEqual({ kind: 'choice', reason: 'expired' });
	});

	it('asks again when the policy changes', () => {
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: acknowledgement(NOW - 1000, 'choice-fp-0'),
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'policy-changed',
		});
	});

	it('never takes a notice dismissal for an acknowledgement', () => {
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: acknowledgement(NOW - 1000, policy.notice.fingerprint),
			now: NOW,
			policy,
		});
		expect(result.promptRequirement.kind).toBe('choice');
	});

	it('is answered by a choice still valid under the current policy', () => {
		const choice = makeChoice(
			{ marketing: false },
			NOW - 1000,
			currentBasis(policy)
		);
		const result = evaluateConsentRecord({
			choice,
			noticeDismissal: null,
			now: NOW,
			policy,
		});
		expect(result.promptRequirement).toEqual({ kind: 'none' });
		expect(result.nextDeadline).toBe(NOW - 1000 + DAY);
	});

	it('stops being answered by an acknowledgement once a category is displayed', () => {
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: acknowledgement(NOW - 1000),
			now: NOW,
			policy: makePolicy({ choiceScope: ['marketing'] }),
		});
		expect(result.promptRequirement).toEqual({
			kind: 'choice',
			reason: 'missing',
		});
	});
});

describe('evaluateConsentRecord: durable opt-out record', () => {
	const optOut: OptOutRecord = {
		heldBy: 'device',
		method: 'button',
		recordedAt: NOW,
		rights: ['sale', 'share'],
	};
	const usOptOutPolicy = makePolicy({
		choice: { fingerprint: 'choice-fp-1', maxAgeMs: 365 * DAY },
		gpcDenyCategories: ['marketing', 'measurement'],
		model: 'opt-out',
		prompt: 'none',
	});

	it('denies mapped categories with reason opt-out and allows other categories', () => {
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(result.permissions).toEqual({
			experience: true,
			functionality: true,
			marketing: false,
			measurement: false,
			necessary: true,
		});
		expect(result.restrictions).toEqual({
			marketing: ['opt-out'],
			measurement: ['opt-out'],
		});
	});

	it('never expires past 365 days or far past it', () => {
		for (const ageDays of [366, 800]) {
			const result = evaluateConsentRecord({
				choice: null,
				noticeDismissal: null,
				now: NOW + ageDays * DAY,
				optOut,
				policy: usOptOutPolicy,
			});
			expect(result.permissions.marketing).toBe(false);
			expect(result.permissions.measurement).toBe(false);
			expect(result.restrictions).toEqual({
				marketing: ['opt-out'],
				measurement: ['opt-out'],
			});
			expect(result.nextDeadline).toBeNull();
		}
	});

	it('survives policy changes, expired grants and valid grants', () => {
		const granted = makeChoice(
			{ marketing: true },
			NOW,
			currentBasis(usOptOutPolicy)
		);
		const validGrantResult = evaluateConsentRecord({
			choice: granted,
			noticeDismissal: null,
			now: NOW + DAY,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(validGrantResult.permissions.marketing).toBe(false);
		expect(validGrantResult.restrictions.marketing).toEqual(['opt-out']);

		const changedPolicy = makePolicy({
			choice: { fingerprint: 'choice-fp-2', maxAgeMs: 30 * DAY },
			gpcDenyCategories: ['marketing', 'measurement'],
			model: 'opt-out',
			prompt: 'none',
		});
		const expiredAndChangedResult = evaluateConsentRecord({
			choice: granted,
			noticeDismissal: null,
			now: NOW + 400 * DAY,
			optOut,
			policy: changedPolicy,
		});
		expect(expiredAndChangedResult.permissions.marketing).toBe(false);
		expect(expiredAndChangedResult.permissions.measurement).toBe(false);
		expect(expiredAndChangedResult.restrictions.marketing).toEqual(['opt-out']);
	});

	it('keeps denial when GPC is false, denies with gpc only without a record, and orders gpc before opt-out', () => {
		const recordOnly = evaluateConsentRecord({
			choice: null,
			gpc: false,
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(recordOnly.permissions.marketing).toBe(false);
		expect(recordOnly.restrictions.marketing).toEqual(['opt-out']);

		const gpcOnly = evaluateConsentRecord({
			choice: null,
			gpc: true,
			noticeDismissal: null,
			now: NOW,
			optOut: null,
			policy: usOptOutPolicy,
		});
		expect(gpcOnly.permissions.marketing).toBe(false);
		expect(gpcOnly.restrictions.marketing).toEqual(['gpc']);

		const both = evaluateConsentRecord({
			choice: null,
			gpc: true,
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(both.restrictions.marketing).toEqual(['gpc', 'opt-out']);
	});

	it('keeps prompt requirement none at every age under a choice-prompt rule', () => {
		const optInWithDeny = makePolicy({
			choice: { fingerprint: 'choice-fp-1', maxAgeMs: 365 * DAY },
			gpcDenyCategories: ['marketing', 'measurement'],
			model: 'opt-in',
			prompt: 'choice',
		});
		for (const ageDays of [1, 364, 366, 800]) {
			const missingOther = evaluateConsentRecord({
				choice: null,
				noticeDismissal: null,
				now: NOW + ageDays * DAY,
				optOut,
				policy: optInWithDeny,
			});
			expect(missingOther.promptRequirement).toEqual({ kind: 'none' });

			const policyChanged = evaluateConsentRecord({
				choice: makeChoice({ functionality: true }, NOW, {
					fingerprint: 'old-fp',
					kind: 'choice-v1',
				}),
				noticeDismissal: null,
				now: NOW + ageDays * DAY,
				optOut,
				policy: optInWithDeny,
			});
			expect(policyChanged.promptRequirement).toEqual({ kind: 'none' });
		}
	});

	it('denies marketing and measurement even when the GPC deny list is empty', () => {
		const noDenyPolicy = makePolicy({
			gpcDenyCategories: [],
			model: 'opt-out',
			prompt: 'none',
		});
		const result = evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: noDenyPolicy,
		});
		expect(result.permissions).toEqual({
			experience: true,
			functionality: true,
			marketing: false,
			measurement: false,
			necessary: true,
		});
		expect(result.restrictions).toEqual({
			marketing: ['opt-out'],
			measurement: ['opt-out'],
		});
	});

	it('denies only the marketing or measurement categories in scope', () => {
		const marketingOnly = makePolicy({
			gpcDenyCategories: [],
			model: 'opt-out',
			prompt: 'none',
			scope: ['functionality', 'marketing'],
			scopeMode: 'permissive',
		});
		const oneResult = evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: marketingOnly,
		});
		expect(oneResult.permissions).toEqual({
			experience: true,
			functionality: true,
			marketing: false,
			measurement: true,
			necessary: true,
		});
		expect(oneResult.restrictions).toEqual({
			marketing: ['opt-out'],
		});

		const neitherInScope = makePolicy({
			gpcDenyCategories: [],
			model: 'opt-out',
			prompt: 'none',
			scope: ['experience', 'functionality'],
			scopeMode: 'permissive',
		});
		const neitherResult = evaluateConsentRecord({
			choice: null,
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: neitherInScope,
		});
		expect(neitherResult.permissions).toEqual(allTrue);
		expect(neitherResult.restrictions).toEqual({});
	});

	it('applies under every policy model', () => {
		for (const model of ['opt-in', 'opt-out', 'iab', 'none'] as const) {
			const policy = makePolicy({
				gpcDenyCategories: [],
				model,
				prompt: model === 'none' ? 'none' : 'choice',
			});
			const result = evaluateConsentRecord({
				choice: makeChoice(
					{ marketing: true, measurement: true },
					NOW,
					currentBasis(policy)
				),
				noticeDismissal: null,
				now: NOW,
				optOut,
				policy,
			});
			expect(result.permissions.marketing).toBe(false);
			expect(result.permissions.measurement).toBe(false);
			expect(result.restrictions).toEqual({
				marketing: ['opt-out'],
				measurement: ['opt-out'],
			});
		}
	});

	it('computes the 366-day opt-in reprompt threshold from recordedAt', () => {
		expect(OPT_OUT_REPROMPT_WAIT_MS).toBe(366 * DAY);
		expect(optInPromptAllowedAt(optOut)).toBe(NOW + 366 * DAY);
	});

	it('lets a valid explicit measurement grant stand while marketing is explicitly false', () => {
		const choice = makeChoice(
			{ marketing: false, measurement: true },
			NOW,
			currentBasis(usOptOutPolicy)
		);
		const result = evaluateConsentRecord({
			choice,
			noticeDismissal: null,
			now: NOW + DAY,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(result.permissions.marketing).toBe(false);
		expect(result.permissions.measurement).toBe(true);
		expect(result.categories.measurement.source).toBe('grant');
		expect(result.restrictions).toEqual({
			marketing: ['explicit-denial', 'opt-out'],
		});
		// Measurement grant expiry will restore the opt-out restriction.
		expect(result.nextDeadline).toBe(NOW + 365 * DAY);
	});

	it('does not let a measurement grant stand when marketing is true, or undecided and the grant predates the opt-out', () => {
		const staleGrant = makeChoice(
			{ marketing: true, measurement: true },
			NOW,
			currentBasis(usOptOutPolicy)
		);
		const withMarketingTrue = evaluateConsentRecord({
			choice: staleGrant,
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(withMarketingTrue.permissions.measurement).toBe(false);
		expect(withMarketingTrue.restrictions.measurement).toEqual(['opt-out']);

		const marketingUndecided = makeChoice(
			{ measurement: true },
			NOW,
			currentBasis(usOptOutPolicy)
		);
		const withMarketingUndecided = evaluateConsentRecord({
			choice: marketingUndecided,
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(withMarketingUndecided.permissions.measurement).toBe(false);
		expect(withMarketingUndecided.restrictions.measurement).toEqual([
			'opt-out',
		]);
	});

	it('lets a measurement grant confirmed after a legacy opt-out stand while marketing is undecided', () => {
		// `/v1/consent/init` sends an opt-out with no categories, so it
		// withholds marketing and measurement, and Preferences then saves
		// only the switched category.
		expect(optOut.categories).toBeUndefined();
		const later = makeChoice(
			{ measurement: true },
			NOW + DAY,
			currentBasis(usOptOutPolicy)
		);
		const result = evaluateConsentRecord({
			choice: later,
			noticeDismissal: null,
			now: NOW + DAY,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(result.permissions.measurement).toBe(true);
		expect(result.categories.measurement.source).toBe('grant');
		expect(result.permissions.marketing).toBe(false);
		expect(result.restrictions).toEqual({ marketing: ['opt-out'] });
		// Grant expiry restores the opt-out restriction.
		expect(result.nextDeadline).toBe(NOW + DAY + 365 * DAY);
	});

	it('refuses a later grant of the deciding category, and a later grant beside it, while the opt-out is held', () => {
		const grantsBoth = evaluateConsentRecord({
			choice: makeChoice(
				{ marketing: true, measurement: true },
				NOW + DAY,
				currentBasis(usOptOutPolicy)
			),
			noticeDismissal: null,
			now: NOW + DAY,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(grantsBoth.permissions.marketing).toBe(false);
		expect(grantsBoth.permissions.measurement).toBe(false);
		expect(grantsBoth.restrictions).toEqual({
			marketing: ['opt-out'],
			measurement: ['opt-out'],
		});
	});

	it('does not let an expired or policy-changed measurement grant stand', () => {
		const choice = makeChoice(
			{ marketing: false, measurement: true },
			NOW,
			currentBasis(usOptOutPolicy)
		);
		const expired = evaluateConsentRecord({
			choice,
			noticeDismissal: null,
			now: NOW + 365 * DAY,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(expired.permissions.measurement).toBe(false);
		expect(expired.restrictions.measurement).toEqual(['opt-out']);
		expect(expired.nextDeadline).toBeNull();

		const changedPolicy = makePolicy({
			...usOptOutPolicy,
			choice: { fingerprint: 'choice-fp-2', maxAgeMs: 365 * DAY },
		});
		const policyChanged = evaluateConsentRecord({
			choice,
			noticeDismissal: null,
			now: NOW + DAY,
			optOut,
			policy: changedPolicy,
		});
		expect(policyChanged.permissions.measurement).toBe(false);
		expect(policyChanged.restrictions.measurement).toEqual(['opt-out']);
	});

	it('keeps measurement denied with gpc when GPC is active and maps measurement', () => {
		const choice = makeChoice(
			{ marketing: false, measurement: true },
			NOW,
			currentBasis(usOptOutPolicy)
		);
		const result = evaluateConsentRecord({
			choice,
			gpc: true,
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: usOptOutPolicy,
		});
		expect(result.permissions.marketing).toBe(false);
		expect(result.permissions.measurement).toBe(false);
		expect(result.restrictions).toEqual({
			marketing: ['explicit-denial', 'gpc', 'opt-out'],
			measurement: ['gpc'],
		});
	});

	it('does not exempt measurement when marketing is out of scope and measurement decides', () => {
		const measurementOnly = makePolicy({
			choice: { fingerprint: 'choice-fp-1', maxAgeMs: 365 * DAY },
			gpcDenyCategories: [],
			model: 'opt-out',
			prompt: 'none',
			scope: ['functionality', 'measurement'],
			scopeMode: 'permissive',
		});
		const result = evaluateConsentRecord({
			choice: makeChoice(
				{ marketing: false, measurement: true },
				NOW,
				currentBasis(measurementOnly)
			),
			noticeDismissal: null,
			now: NOW,
			optOut,
			policy: measurementOnly,
		});
		expect(result.permissions.measurement).toBe(false);
		expect(result.restrictions.measurement).toEqual(['opt-out']);
	});
});

describe('validateOptOutRecord', () => {
	it('accepts all valid methods and holders and returns rights in canonical order', () => {
		for (const method of ['button', 'gpc', 'api', 'propagated'] as const) {
			for (const heldBy of ['device', 'person', 'both'] as const) {
				const result = validateOptOutRecord(
					{
						heldBy,
						method,
						recordedAt: NOW - 10,
						rights: ['targeted_ads', 'sale', 'share'],
					},
					NOW
				);
				expect(result).toEqual({
					ok: true,
					record: {
						heldBy,
						method,
						recordedAt: NOW - 10,
						rights: ['sale', 'share', 'targeted_ads'],
					},
				});
			}
		}
	});

	it('accepts a recordedAt dated ahead of now so slow clocks never drop an opt-out', () => {
		const future = NOW + DAY;
		expect(
			validateOptOutRecord(
				{
					heldBy: 'person',
					method: 'api',
					recordedAt: future,
					rights: ['sale', 'share'],
				},
				NOW
			)
		).toEqual({
			ok: true,
			record: {
				heldBy: 'person',
				method: 'api',
				recordedAt: future,
				rights: ['sale', 'share'],
			},
		});
	});

	it('accepts an empty rights list for a local opt-out waiting on the backend', () => {
		expect(
			validateOptOutRecord(
				{
					heldBy: 'device',
					method: 'button',
					recordedAt: NOW,
					rights: [],
				},
				NOW
			)
		).toEqual({
			ok: true,
			record: {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: [],
			},
		});
	});

	it.each([
		['non-object', 'opt-out'],
		['array', []],
		['null', null],
		[
			'non-plain prototype',
			Object.assign(Object.create({ extra: true }), {
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale'],
			}),
		],
		[
			'inherited property',
			Object.create({
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale'],
			}),
		],
		[
			'unknown key',
			{
				extra: 1,
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale'],
			},
		],
		[
			'duplicate right',
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['sale', 'sale'],
			},
		],
		[
			'unknown right',
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW,
				rights: ['unknown'],
			},
		],
		[
			'unknown method',
			{ heldBy: 'device', method: 'other', recordedAt: NOW, rights: ['sale'] },
		],
		[
			'unknown holder',
			{ heldBy: 'other', method: 'button', recordedAt: NOW, rights: ['sale'] },
		],
		[
			'negative timestamp',
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: -1,
				rights: ['sale'],
			},
		],
		[
			'non-integer timestamp',
			{
				heldBy: 'device',
				method: 'button',
				recordedAt: NOW - 0.5,
				rights: ['sale'],
			},
		],
	])('rejects %s', (_label, input) => {
		expect(validateOptOutRecord(input, NOW).ok).toBe(false);
	});
});
