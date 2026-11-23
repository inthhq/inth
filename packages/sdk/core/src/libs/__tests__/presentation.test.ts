import { normalizePolicyRule } from '@inth/sdk-schema/types';
import { describe, expect, it } from 'vitest';

import { resolveConsentPresentation } from '../policy-actions';

const choice = normalizePolicyRule({
	id: 'choice',
	match: { fallback: true },
	model: 'opt-in',
	prompt: 'choice',
});
const notice = normalizePolicyRule({
	id: 'notice',
	match: { fallback: true },
	model: 'opt-out',
	prompt: 'notice',
});

describe('host presentation', () => {
	it('keeps required accept and reject at equal default prominence', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			surface: 'prompt',
		});
		expect(result.primaryActions).toEqual(['customize']);
		expect(result.equivalentActions).toEqual([['accept', 'reject']]);
		expect(result.diagnostics).toEqual([]);
	});
	it('defaults to reject and accept together, then customize, on one compact row', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			surface: 'prompt',
		});
		expect(result.actionGroups).toEqual([['reject', 'accept'], ['customize']]);
		expect(result.primaryActions).toEqual(['customize']);
		expect(result.direction).toBe('row');
		expect(result.uiProfile).toBe('compact');
		expect(result.shouldFillActions).toBe(false);
	});
	it('defaults preferences to reject and accept together, then save', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			surface: 'preferences',
		});
		expect(result.actionGroups).toEqual([['reject', 'accept'], ['save']]);
		expect(result.primaryActions).toEqual(['save']);
	});
	it('leaves no default primary when the rule omits customize', () => {
		const result = resolveConsentPresentation({
			policy: normalizePolicyRule({
				actions: ['accept', 'reject'],
				id: 'two-actions',
				match: { fallback: true },
				model: 'opt-in',
				prompt: 'choice',
			}),
			surface: 'prompt',
		});
		expect(result.actionGroups).toEqual([['reject', 'accept']]);
		expect(result.primaryActions).toEqual([]);
		expect(result.diagnostics).toEqual([]);
	});
	it('defaults a notice prompt to its single dismiss action', () => {
		const result = resolveConsentPresentation({
			policy: notice,
			surface: 'prompt',
		});
		expect(result.actionGroups).toEqual([['dismiss']]);
		expect(result.primaryActions).toEqual(['dismiss']);
	});
	it('keeps an explicit balanced profile filling and stacking', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			presentation: { prompt: { uiProfile: 'balanced' } },
			surface: 'prompt',
		});
		expect(result.shouldFillActions).toBe(true);
	});
	it('restores required actions and removes forbidden actions', () => {
		const result = resolveConsentPresentation({
			override: { layout: ['customize', 'dismiss'] },
			policy: choice,
			surface: 'prompt',
		});
		expect(result.orderedActions).toEqual(['customize', 'accept', 'reject']);
		expect(result.diagnostics.map((issue) => issue.code)).toEqual([
			'forbidden-action',
			'required-action-restored',
		]);
	});
	it('uses local overrides before host presentation and diagnoses unequal prominence', () => {
		const result = resolveConsentPresentation({
			override: { direction: 'row', primaryActions: ['accept'] },
			policy: choice,
			presentation: {
				prompt: { direction: 'column', primaryActions: ['accept', 'reject'] },
			},
			surface: 'prompt',
		});
		expect(result.direction).toBe('row');
		expect(result.diagnostics[0]?.code).toBe(
			'equivalent-prominence-overridden'
		);
	});
	it('notice has only dedicated dismissal and stays nonblocking', () => {
		const result = resolveConsentPresentation({
			override: { blockUntilChoice: true, layout: ['accept'] },
			policy: notice,
			surface: 'prompt',
		});
		expect(result.orderedActions).toEqual(['dismiss']);
		expect(result.blocking).toBe(false);
	});
	it('notice preferences retain choice commands and persistent rights', () => {
		const result = resolveConsentPresentation({
			policy: notice,
			surface: 'preferences',
		});
		expect(result.orderedActions).toEqual(['reject', 'accept', 'save']);
		expect(result.rights).toContain('preferences');
		expect(result.rights).toContain('opt-out');
	});
	describe('additional preferences controls', () => {
		it('lists only opt-out on a notice, since that control opens preferences', () => {
			const result = resolveConsentPresentation({
				policy: notice,
				surface: 'prompt',
			});
			expect(result.rights).toContain('disclosure');
			expect(result.rights).toContain('preferences');
			expect(result.preferenceControls).toEqual(['opt-out']);
		});
		it('covers preferences with customize on a choice prompt', () => {
			const result = resolveConsentPresentation({
				policy: choice,
				surface: 'prompt',
			});
			expect(result.preferenceControls).toEqual([]);
		});
		it('leaves preferences uncovered when the rule omits customize', () => {
			const result = resolveConsentPresentation({
				policy: normalizePolicyRule({
					actions: ['accept', 'reject'],
					id: 'two-actions',
					match: { fallback: true },
					model: 'opt-in',
					prompt: 'choice',
				}),
				surface: 'prompt',
			});
			expect(result.preferenceControls).toEqual(['preferences']);
		});
		it('covers opt-out with reject on an opt-out choice prompt', () => {
			const result = resolveConsentPresentation({
				policy: normalizePolicyRule({
					actions: ['accept', 'reject'],
					id: 'opt-out-choice',
					match: { fallback: true },
					model: 'opt-out',
					prompt: 'choice',
				}),
				surface: 'prompt',
			});
			expect(result.rights).toContain('opt-out');
			expect(result.preferenceControls).toEqual(['preferences']);
		});
		it('covers every right on the preferences surface', () => {
			const result = resolveConsentPresentation({
				policy: notice,
				surface: 'preferences',
			});
			expect(result.preferenceControls).toEqual([]);
		});
	});
});

describe('surface shape', () => {
	it.each([undefined, false, true])(
		'never blocks a notice, even in a centred card, with blockUntilChoice=%s',
		(blockUntilChoice) => {
			const result = resolveConsentPresentation({
				override: {
					blockUntilChoice,
					container: { position: 'center', type: 'card' },
				},
				policy: notice,
				surface: 'prompt',
			});
			expect(result.container?.desktop.placement).toBe('card-start');
			expect(result.blocking).toBe(false);
			expect(result.container?.desktop.blocking).toBe(false);
		}
	);
	it('has no container on the preferences surface', () => {
		const result = resolveConsentPresentation({
			override: { container: { edge: 'top', type: 'banner' } },
			policy: choice,
			surface: 'preferences',
		});
		expect(result.container).toBeNull();
	});
	it('defaults a choice prompt to an inset card in the start corner', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			surface: 'prompt',
		});
		expect(result.container?.desktop).toMatchObject({
			blocking: false,
			edgeStyle: 'inset',
			flow: 'expand-in-place',
			placement: 'card-start',
			type: 'card',
		});
		expect(result.container?.phone.placement).toBe('card-start');
		expect(result.blocking).toBe(false);
	});
	it('defaults a notice prompt to a card that never blocks', () => {
		const result = resolveConsentPresentation({
			policy: notice,
			presentation: { prompt: { blockUntilChoice: true } },
			surface: 'prompt',
		});
		expect(result.container?.desktop.placement).toBe('card-start');
		expect(result.blocking).toBe(false);
		expect(
			result.container?.desktop.diagnostics.map((diagnostic) => diagnostic.code)
		).toEqual(['blocking-forbidden']);
	});
	it('renders a notice as a bottom banner when the host asks for one', () => {
		const result = resolveConsentPresentation({
			policy: notice,
			presentation: {
				prompt: { container: { edge: 'bottom', type: 'banner' } },
			},
			surface: 'prompt',
		});
		expect(result.container?.desktop.placement).toBe('banner-bottom');
		expect(result.blocking).toBe(false);
		expect(result.diagnostics).toEqual([]);
	});
	it('makes a centred card block, whatever the host asks', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			presentation: {
				prompt: {
					blockUntilChoice: false,
					container: { position: 'center', type: 'card' },
				},
			},
			surface: 'prompt',
		});
		expect(result.blocking).toBe(true);
		expect(result.container?.desktop.placement).toBe('card-center');
		expect(
			result.container?.desktop.diagnostics.map((diagnostic) => diagnostic.code)
		).toEqual(['blocking-required']);
	});
	it('blocks a corner card when the host asks', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			presentation: { prompt: { blockUntilChoice: true } },
			surface: 'prompt',
		});
		expect(result.blocking).toBe(true);
		expect(result.container?.desktop.blocking).toBe(true);
	});
	it('lets blockUntilChoice win over blocking in the same tier', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			presentation: { prompt: { blockUntilChoice: false, blocking: true } },
			surface: 'prompt',
		});
		expect(result.blocking).toBe(false);
	});
	it('defaults the preferences surface to blocking', () => {
		const result = resolveConsentPresentation({
			policy: notice,
			surface: 'preferences',
		});
		expect(result.blocking).toBe(true);
		expect(result.diagnostics).toEqual([]);
	});
	it('honors an explicit non-blocking preferences dialog without a diagnostic', () => {
		const result = resolveConsentPresentation({
			policy: choice,
			presentation: { preferences: { blocking: false } },
			surface: 'preferences',
		});
		expect(result.blocking).toBe(false);
		expect(result.diagnostics).toEqual([]);
	});
	it('lets a local override beat host presentation for the container', () => {
		const result = resolveConsentPresentation({
			override: { container: { edge: 'top', type: 'banner' } },
			policy: choice,
			presentation: {
				prompt: {
					blockUntilChoice: true,
					container: { position: 'end', type: 'card' },
				},
			},
			surface: 'prompt',
		});
		expect(result.container?.desktop.placement).toBe('banner-top');
		expect(result.blocking).toBe(true);
		expect(result.diagnostics).toEqual([]);
	});
});

it('uses generic preference copy for a non-US opt-out message profile', () => {
	const policy = normalizePolicyRule({
		i18n: { messageProfile: 'preferences' },
		id: 'canada',
		match: { countries: ['CA'] },
		model: 'opt-out',
		prompt: 'notice',
	});
	const presentation = resolveConsentPresentation({
		policy,
		surface: 'prompt',
	});
	expect(presentation.preferenceControls).toEqual(['preferences']);
	expect(presentation.rights).toContain('opt-out');
	expect(presentation.orderedActions).toEqual(['dismiss']);
});

it('resolves optOutLink to do-not-sell by default and passes configured variants through', () => {
	expect(
		resolveConsentPresentation({ policy: choice, surface: 'prompt' }).optOutLink
	).toBe('do-not-sell');
	expect(
		resolveConsentPresentation({
			policy: choice,
			presentation: { optOutLink: 'privacy-choices' },
			surface: 'prompt',
		}).optOutLink
	).toBe('privacy-choices');
	expect(
		resolveConsentPresentation({
			policy: choice,
			presentation: { optOutLink: 'california-privacy-choices' },
			surface: 'prompt',
		}).optOutLink
	).toBe('california-privacy-choices');
});
